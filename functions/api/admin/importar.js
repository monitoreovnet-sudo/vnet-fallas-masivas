import { json, badRequest, requireAdmin } from "../../_lib/helpers.js";

// POST /api/admin/importar
// Body: { tickets: [...], puertos: [...] }  (ya parseados y normalizados en el navegador)
// Idempotente: segura de subir el mismo archivo más de una vez. Usa:
//   - INSERT OR IGNORE en tickets (clave: ticket_cmr, ya es UNIQUE)
//   - un índice único (ticket_id, olt, tarjeta, puerto) + INSERT OR IGNORE en ticket_puertos
export async function onRequestPost({ request, env }) {
  const usuario = await requireAdmin(request, env);
  const body = await request.json();
  const db = env.DB;

  const tickets = Array.isArray(body.tickets) ? body.tickets : [];
  const puertos = Array.isArray(body.puertos) ? body.puertos : [];
  if (tickets.length === 0 && puertos.length === 0) {
    return badRequest("El archivo no produjo ningún registro para importar.");
  }

  // Asegura el índice único (no falla si ya existe).
  await db.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_puertos_unico ON ticket_puertos(ticket_id, olt, tarjeta, puerto)"
  ).run();

  // ---------- Tickets ----------
  const COLS_TICKETS = [
    "ticket_cmr", "tickets_vinculados", "fecha_apertura_cda", "fecha_apertura_cmr",
    "estado_ticket", "unidad_resolutoria", "categoria_afectacion", "afectacion",
    "comentario", "descripcion", "avance_cmr", "fecha_solucion_cmr", "fecha_solucion_cda",
  ];
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

  // Mapa ticket_cmr -> id (incluye los recién insertados y los ya existentes)
  const { results: filasTickets } = await db.prepare("SELECT id, ticket_cmr FROM tickets").all();
  const idPorTicketCmr = new Map(filasTickets.map((r) => [String(r.ticket_cmr), r.id]));

  // Mapa codigo de oficina -> id
  const { results: filasOficinas } = await db.prepare("SELECT id, codigo FROM oficinas").all();
  const idPorCodigoOficina = new Map(filasOficinas.map((r) => [r.codigo, r.id]));

  // ---------- Puertos ----------
  const COLS_PUERTOS = [
    "ticket_id", "oficina_id", "olt", "tarjeta", "puerto", "sector", "edificio",
    "no_clientes_reportaron", "nro_clientes_afectados", "estado_puerto",
  ];
  let puertosInsertados = 0;
  let puertosSinTicket = 0;
  let puertosSinOficina = 0;
  const stmts = [];
  for (const p of puertos) {
    const ticketId = idPorTicketCmr.get(String(p.ticket_cmr));
    if (!ticketId) { puertosSinTicket += 1; continue; }
    const oficinaId = p.oficina_codigo ? idPorCodigoOficina.get(p.oficina_codigo) || null : null;
    if (p.oficina_codigo && !oficinaId) puertosSinOficina += 1;
    stmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO ticket_puertos (${COLS_PUERTOS.join(", ")}) VALUES (${COLS_PUERTOS.map(() => "?").join(", ")})`
      ).bind(
        ticketId, oficinaId, p.olt || "DESCONOCIDO", p.tarjeta || "DESCONOCIDO", p.puerto || "DESCONOCIDO",
        p.sector || "DESCONOCIDO", p.edificio || "DESCONOCIDO",
        Number(p.no_clientes_reportaron || 0), Number(p.nro_clientes_afectados || 0),
        p.estado_puerto || "CERRADO"
      )
    );
  }
  for (let i = 0; i < stmts.length; i += CHUNK) {
    const resultados = await db.batch(stmts.slice(i, i + CHUNK));
    puertosInsertados += resultados.reduce((s, r) => s + (r.meta?.changes || 0), 0);
  }

  // (No se registra en ticket_log: esa tabla exige un ticket_id puntual y
  // esta es una operación masiva sobre muchos tickets a la vez.)

  return json({
    tickets_recibidos: tickets.length,
    tickets_insertados: ticketsInsertados,
    tickets_ya_existian: tickets.length - ticketsInsertados,
    puertos_recibidos: puertos.length,
    puertos_insertados: puertosInsertados,
    puertos_ya_existian: puertos.length - puertosInsertados - puertosSinTicket,
    puertos_sin_ticket: puertosSinTicket,
    puertos_sin_oficina_reconocida: puertosSinOficina,
  });
}
