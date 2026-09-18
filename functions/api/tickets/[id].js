import { json, notFound } from "../../_lib/helpers.js";

// GET /api/tickets/:id  (acepta id numérico interno o el número de Ticket CMR-COR)
export async function onRequestGet({ params, env }) {
  const db = env.DB;
  const idOrCmr = params.id;

  const ticket = await db
    .prepare(
      `SELECT t.*, o.nombre AS oficina_nombre, o.estado AS oficina_estado, o.localidad AS oficina_localidad
       FROM tickets t
       LEFT JOIN oficinas o ON o.id = t.oficina_id
       WHERE t.id = ? OR t.ticket_cmr = ?`
    )
    .bind(idOrCmr, idOrCmr)
    .first();

  if (!ticket) return notFound("Ticket no encontrado");

  const puertos = await db
    .prepare(
      `SELECT p.*, o.nombre AS oficina_nombre
       FROM ticket_puertos p
       LEFT JOIN oficinas o ON o.id = p.oficina_id
       WHERE p.ticket_id = ?
       ORDER BY o.nombre, p.olt, p.tarjeta, p.puerto`
    )
    .bind(ticket.id)
    .all();

  return json({ ticket, puertos: puertos.results });
}
