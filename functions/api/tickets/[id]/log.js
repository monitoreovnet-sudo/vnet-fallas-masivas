import { json, notFound } from "../../../_lib/helpers.js";

// GET /api/tickets/:id/log
export async function onRequestGet({ params, env }) {
  const db = env.DB;
  const ticket = await db
    .prepare("SELECT id FROM tickets WHERE id = ? OR ticket_cmr = ?")
    .bind(params.id, params.id)
    .first();
  if (!ticket) return notFound("Ticket no encontrado");

  const log = await db
    .prepare(
      `SELECT l.*, p.olt, p.tarjeta, p.puerto
       FROM ticket_log l
       LEFT JOIN ticket_puertos p ON p.id = l.ticket_puerto_id
       WHERE l.ticket_id = ?
       ORDER BY l.fecha DESC, l.id DESC`
    )
    .bind(ticket.id)
    .all();

  return json({ log: log.results });
}
