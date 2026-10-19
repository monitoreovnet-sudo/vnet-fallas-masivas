import { json, badRequest, requireAdmin } from "../../_lib/helpers.js";

// POST /api/admin/importar
// Body: { tickets: [...], puertos: [...] }  (ya parseados y normalizados en el navegador;
// el navegador lo envía en lotes de ~100 tickets con sus puertos).
//
// Reglas (seguro de repetir el mismo archivo cuantas veces quieras):
//  - Un ticket que YA existe (mismo ticket_cmr) no se modifica.
//  - Un ticket que ya tenía puertos NO recibe puertos nuevos (así nada se duplica ni se
//    pisan cambios hechos desde la app). Si existía pero sin puertos, se le agregan.
//  - Los puertos de un mismo ticket entran juntos en una misma transacción (batch).
export async function onRequestPost({ request, env }) {
  await requireAdmin(request, env);
  const body = await request.json();
  const db = env.DB;

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
    "ticket_cmr", "tickets_vinculados", "fecha_apertura_cda", "fecha_apertura_cmr",
    "estado_ticket", "unidad_resolutoria", "categoria_afectacion", "afectacion",
    "comentario", "descripcion", "avance_cmr", "fecha_solucion_cmr", "fecha_solucion_cda",
  ];

  // Foto ANTES de insertar: qué tickets ya tenían puertos.
  const { results: previos } = await db.prepare("SELECT DISTINCT ticket_id FROM ticket_puertos").all();
  const ticketIdsConPuertos = new Set(previos.map((r) => r.ticket_id));

  let ticketsInsertados = 0;
  const CHUNK = 50;
  for (let i = 0; i < tickets.length; i += CHUNK) {
    const lote = tickets.slice(i, i + CHUNK).map((t) =>
      db.prepare(
        `INSERT OR IGNORE INTO tickets (${COLS_TICKETS.join(", ")}) VALUES (${COLS_TICKETS.map(() => "?").join(", ")})`
      ).bind(...COLS_TICKETS.map((c) => (t[c] === undefined || t[c] === "" ? null : t[c])))
    );
    const resultados = await db.batch(lote);
    ticketsInsertados += resultados.reduce((s, r) => s + (r.meta?.changes || 0), 0);
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
  for (const p of puertos) {
    const ticketId = idPorTicketCmr.get(String(p.ticket_cmr));
    if (!ticketId) { puertosSinTicket += 1; continue; }
    if (ticketIdsConPuertos.has(ticketId)) { puertosOmitidos += 1; continue; }

    let oficinaId = null;
    if (p.oficina_id && oficinaIdsValidos.has(Number(p.oficina_id))) oficinaId = Number(p.oficina_id);
    else if (p.oficina_codigo && idPorCodigoOficina.has(p.oficina_codigo)) oficinaId = idPorCodigoOficina.get(p.oficina_codigo);
    if (oficinaId === null) puertosSinOficina += 1;   // oficina no reconocida (queda sin oficina)

    const stmt = db.prepare(
      `INSERT INTO ticket_puertos (${COLS_PUERTOS.join(", ")}) VALUES (${COLS_PUERTOS.map(() => "?").join(", ")})`
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

  return json({
    tickets_recibidos: tickets.length,
    tickets_insertados: ticketsInsertados,
    tickets_ya_existian: tickets.length - ticketsInsertados,
    puertos_recibidos: puertos.length,
    puertos_insertados: puertosInsertados,
    puertos_ya_existian: puertosOmitidos,
    puertos_sin_ticket: puertosSinTicket,
    puertos_sin_oficina_reconocida: puertosSinOficina,
  });
}
