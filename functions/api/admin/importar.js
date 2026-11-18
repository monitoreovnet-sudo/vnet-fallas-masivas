import { json, badRequest, requireAdmin } from "../../_lib/helpers.js";
import { recalcularConteos } from "../../_lib/asociacion.js";

// POST /api/admin/importar
// Body: { tickets: [...], puertos: [...] }  (ya parseados y normalizados en el navegador;
// el navegador lo envía en lotes de ~100 tickets con sus puertos).
//
// Reglas (seguro de repetir el mismo archivo cuantas veces quieras):
//  - Un ticket que YA existe (mismo ticket_cmr) no se modifica.
//  - Un ticket que ya tenía puertos NO recibe puertos nuevos (así nada se duplica ni se
//    pisan cambios hechos desde la app). Si existía pero sin puertos, se le agregan.
//  - Los puertos de un mismo ticket entran juntos en una misma transacción (batch).
//
// Con body.reemplazar === true (casilla "Reescribir tickets que ya existen"):
//  - Un ticket que YA existe se actualiza con todos los datos del archivo (conserva su id, su log y sus ONUs).
//    Excepción: "Tickets Vinculados" y "Descripción" vacíos en el archivo NO borran lo que ya tenía el ticket.
//  - Sus filas de detalle se sincronizan con las del archivo: las que coinciden (oficina + OLT + tarjeta + puerto)
//    se actualizan (conservan causa, correctivo, ubicación y fechas de cierre); las que sobran se eliminan; las nuevas se agregan.
//  - Queda una línea en el log del ticket.
export async function onRequestPost({ request, env }) {
  const usuario = await requireAdmin(request, env, ["administrador", "supervisor"]);
  const body = await request.json();
  const db = env.DB;
  const reemplazar = body.reemplazar === true;

  const tickets = Array.isArray(body.tickets) ? body.tickets : [];
  const puertos = Array.isArray(body.puertos) ? body.puertos : [];
  if (tickets.length === 0 && puertos.length === 0) {
    return badRequest("El archivo no produjo ningún registro para importar.");
  }

  // Índice único de versiones anteriores: ya no se usa y estorba (ej. dos filas ENLACE
  // con el mismo OLT). Si no existe, no pasa nada.
  await db.prepare("DROP INDEX IF EXISTS idx_ticket_puertos_unico").run();

  // ---------- Tickets ----------
  const COLS_TICKETS = [
    "ticket_cmr", "tickets_vinculados", "fecha_apertura_cda", "fecha_apertura_cmr", "fecha_falla",
    "estado_ticket", "unidad_resolutoria", "categoria_afectacion", "afectacion",
    "comentario", "descripcion", "avance_cmr", "fecha_solucion_cmr", "fecha_solucion_cda",
  ];

  // Foto ANTES de insertar: qué tickets ya tenían puertos.
  const { results: previos } = await db.prepare("SELECT DISTINCT ticket_id FROM ticket_puertos").all();
  const ticketIdsConPuertos = new Set(previos.map((r) => r.ticket_id));

  let ticketsInsertados = 0;
  let ticketsActualizados = 0;
  const cmrActualizados = new Set();           // tickets que ya existían y se reescribieron
  const CHUNK = 50;
  const valorTicket = (t, c) => (t[c] === undefined || t[c] === "" ? null : t[c]);
  // Estos dos no vienen en todos los archivos: vacío en el archivo = no tocar lo que ya había
  const CONSERVAR_SI_VACIO = new Set(["tickets_vinculados", "descripcion"]);
  const colsUpdate = COLS_TICKETS.filter((c) => c !== "ticket_cmr");
  for (let i = 0; i < tickets.length; i += CHUNK) {
    const grupo = tickets.slice(i, i + CHUNK);
    const lote = grupo.map((t) =>
      db.prepare(
        `INSERT OR IGNORE INTO tickets (${COLS_TICKETS.join(", ")}, creado_en, actualizado_en) VALUES (${COLS_TICKETS.map(() => "?").join(", ")}, datetime('now','-4 hours'), datetime('now','-4 hours'))`
      ).bind(...COLS_TICKETS.map((c) => valorTicket(t, c)))
    );
    const resultados = await db.batch(lote);
    ticketsInsertados += resultados.reduce((s, r) => s + (r.meta?.changes || 0), 0);

    if (reemplazar) {
      const existentes = grupo.filter((_, k) => !(resultados[k].meta?.changes > 0));
      if (existentes.length) {
        const pasos = [];
        for (const t of existentes) {
          pasos.push(db.prepare(
            `UPDATE tickets SET ${colsUpdate.map((c) => (CONSERVAR_SI_VACIO.has(c) ? `${c} = COALESCE(?, ${c})` : `${c} = ?`)).join(", ")}, actualizado_en = datetime('now','-4 hours') WHERE ticket_cmr = ?`
          ).bind(...colsUpdate.map((c) => valorTicket(t, c)), String(t.ticket_cmr)));
        }
        await db.batch(pasos);
        existentes.forEach((t) => cmrActualizados.add(String(t.ticket_cmr)));
        ticketsActualizados += existentes.length;
      }
    }
  }

  // ticket_cmr -> id
  const { results: filasTickets } = await db.prepare("SELECT id, ticket_cmr FROM tickets").all();
  const idPorTicketCmr = new Map(filasTickets.map((r) => [String(r.ticket_cmr), r.id]));

  // ids de oficina válidos (el navegador manda oficina_id ya resuelto contra el catálogo)
  const { results: filasOficinas } = await db.prepare("SELECT id, codigo FROM oficinas").all();
  const oficinaIdsValidos = new Set(filasOficinas.map((r) => r.id));
  const idPorCodigoOficina = new Map(filasOficinas.map((r) => [r.codigo, r.id]));

  // ---------- Puertos ----------
  const COLS_PUERTOS = [
    "ticket_id", "oficina_id", "olt", "tarjeta", "puerto", "sector", "edificio",
    "no_clientes_reportaron", "nro_clientes_afectados", "estado_puerto",
  ];
  let puertosSinTicket = 0;
  let puertosSinOficina = 0;
  let puertosOmitidos = 0;

  // Agrupa por ticket para que todos los puertos de un ticket entren en la misma transacción.
  const gruposPorTicket = new Map();
  const nuevosEnReemplazo = new Map();   // ticket_id -> puertos del archivo (tickets reescritos que ya tenían detalle)
  for (const p of puertos) {
    const ticketId = idPorTicketCmr.get(String(p.ticket_cmr));
    if (!ticketId) { puertosSinTicket += 1; continue; }
    if (ticketIdsConPuertos.has(ticketId)) {
      if (reemplazar && cmrActualizados.has(String(p.ticket_cmr))) {
        if (!nuevosEnReemplazo.has(ticketId)) nuevosEnReemplazo.set(ticketId, []);
        nuevosEnReemplazo.get(ticketId).push(p);
      } else puertosOmitidos += 1;
      continue;
    }

    let oficinaId = null;
    if (p.oficina_id && oficinaIdsValidos.has(Number(p.oficina_id))) oficinaId = Number(p.oficina_id);
    else if (p.oficina_codigo && idPorCodigoOficina.has(p.oficina_codigo)) oficinaId = idPorCodigoOficina.get(p.oficina_codigo);
    if (oficinaId === null) puertosSinOficina += 1;   // oficina no reconocida (queda sin oficina)

    const stmt = db.prepare(
      `INSERT INTO ticket_puertos (${COLS_PUERTOS.join(", ")}, creado_en, actualizado_en) VALUES (${COLS_PUERTOS.map(() => "?").join(", ")}, datetime('now','-4 hours'), datetime('now','-4 hours'))`
    ).bind(
      ticketId, oficinaId, p.olt || "DESCONOCIDO", p.tarjeta || "DESCONOCIDO", p.puerto || "DESCONOCIDO",
      p.sector || "DESCONOCIDO", p.edificio || "DESCONOCIDO",
      Number(p.no_clientes_reportaron) || 0, Number(p.nro_clientes_afectados) || 0,
      p.estado_puerto || "CERRADO"
    );
    if (!gruposPorTicket.has(ticketId)) gruposPorTicket.set(ticketId, []);
    gruposPorTicket.get(ticketId).push(stmt);
  }

  let puertosInsertados = 0;
  const MAX_BATCH = 100;
  let lote = [];
  const vaciarLote = async () => {
    if (lote.length === 0) return;
    const resultados = await db.batch(lote);
    puertosInsertados += resultados.reduce((s, r) => s + (r.meta?.changes || 0), 0);
    lote = [];
  };
  for (const grupo of gruposPorTicket.values()) {
    if (lote.length > 0 && lote.length + grupo.length > MAX_BATCH) await vaciarLote();
    lote.push(...grupo);       // un ticket nunca se parte entre dos transacciones
    if (lote.length >= MAX_BATCH) await vaciarLote();
  }
  await vaciarLote();

  // ---------- Reescritura de puertos de tickets que ya existían ----------
  let puertosActualizados = 0, puertosEliminados = 0, puertosAgregadosEnReemplazo = 0;
  if (nuevosEnReemplazo.size) {
    const ids = [...nuevosEnReemplazo.keys()];
    const previos = [];
    for (let i = 0; i < ids.length; i += 90) {
      const parte = ids.slice(i, i + 90);
      const { results } = await db.prepare(
        `SELECT id, ticket_id, oficina_id, olt, tarjeta, puerto FROM ticket_puertos WHERE ticket_id IN (${parte.map(() => "?").join(",")}) ORDER BY id`
      ).bind(...parte).all();
      previos.push(...results);
    }
    const clave = (r) => [r.oficina_id ?? "", String(r.olt || "").toUpperCase(), String(r.tarjeta || "").toUpperCase(), String(r.puerto || "").toUpperCase()].join("|");
    const pasos = [];
    for (const [ticketId, nuevos] of nuevosEnReemplazo) {
      const viejos = previos.filter((r) => r.ticket_id === ticketId);
      for (const p of nuevos) {
        let oficinaId = null;
        if (p.oficina_id && oficinaIdsValidos.has(Number(p.oficina_id))) oficinaId = Number(p.oficina_id);
        else if (p.oficina_codigo && idPorCodigoOficina.has(p.oficina_codigo)) oficinaId = idPorCodigoOficina.get(p.oficina_codigo);
        if (oficinaId === null) puertosSinOficina += 1;
        const datos = {
          oficina_id: oficinaId, olt: p.olt || "DESCONOCIDO", tarjeta: p.tarjeta || "DESCONOCIDO", puerto: p.puerto || "DESCONOCIDO",
          sector: p.sector || "DESCONOCIDO", edificio: p.edificio || "DESCONOCIDO",
          rep: Number(p.no_clientes_reportaron) || 0, afe: Number(p.nro_clientes_afectados) || 0, estado: p.estado_puerto || "CERRADO",
        };
        const k = clave(datos);
        const i = viejos.findIndex((r) => clave(r) === k);
        if (i >= 0) {
          const v = viejos.splice(i, 1)[0];
          pasos.push(db.prepare(
            `UPDATE ticket_puertos SET sector = ?, edificio = ?, no_clientes_reportaron = ?, nro_clientes_afectados = ?, estado_puerto = ?, actualizado_en = datetime('now','-4 hours') WHERE id = ?`
          ).bind(datos.sector, datos.edificio, datos.rep, datos.afe, datos.estado, v.id));
          puertosActualizados += 1;
        } else {
          pasos.push(db.prepare(
            `INSERT INTO ticket_puertos (${COLS_PUERTOS.join(", ")}, creado_en, actualizado_en) VALUES (${COLS_PUERTOS.map(() => "?").join(", ")}, datetime('now','-4 hours'), datetime('now','-4 hours'))`
          ).bind(ticketId, datos.oficina_id, datos.olt, datos.tarjeta, datos.puerto, datos.sector, datos.edificio, datos.rep, datos.afe, datos.estado));
          puertosAgregadosEnReemplazo += 1;
        }
      }
      for (const v of viejos) {          // estaban en la base y ya no vienen en el archivo
        pasos.push(db.prepare("DELETE FROM ticket_puertos WHERE id = ?").bind(v.id));
        puertosEliminados += 1;
      }
    }
    for (let i = 0; i < pasos.length; i += 100) await db.batch(pasos.slice(i, i + 100));
  }

  // Línea en el log de cada ticket reescrito
  if (cmrActualizados.size) {
    const logs = [...cmrActualizados].map((cmr) => idPorTicketCmr.get(cmr)).filter(Boolean).map((id) =>
      db.prepare(
        `INSERT INTO ticket_log (ticket_id, ticket_puerto_id, tipo_cambio, campo, valor_anterior, valor_nuevo, usuario_email, fecha)
         VALUES (?, NULL, 'masivo', 'importación', NULL, 'Ticket reescrito desde archivo (Repositorio de tickets)', ?, datetime('now','-4 hours'))`
      ).bind(id, usuario.email));
    for (let i = 0; i < logs.length; i += 100) await db.batch(logs.slice(i, i + 100));
  }

  // Tickets reescritos: se refresca su conteo guardado de clientes afectados (solo esos tickets)
  if (cmrActualizados.size) {
    try { await recalcularConteos(db, [...cmrActualizados].map((cmr) => idPorTicketCmr.get(cmr)).filter(Boolean)); } catch (e) { /* conteo guardado aún no instalado (migración 050) */ }
  }

  return json({
    tickets_recibidos: tickets.length,
    tickets_insertados: ticketsInsertados,
    tickets_ya_existian: tickets.length - ticketsInsertados - ticketsActualizados,
    tickets_actualizados: ticketsActualizados,
    puertos_recibidos: puertos.length,
    puertos_insertados: puertosInsertados + puertosAgregadosEnReemplazo,
    puertos_actualizados: puertosActualizados,
    puertos_eliminados: puertosEliminados,
    puertos_ya_existian: puertosOmitidos,
    puertos_sin_ticket: puertosSinTicket,
    puertos_sin_oficina_reconocida: puertosSinOficina,
  });
}
