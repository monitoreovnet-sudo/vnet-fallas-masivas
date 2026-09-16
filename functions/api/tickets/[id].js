import { json, notFound } from "../../_lib/helpers.js";

// GET /api/tickets/:id  (acepta id numérico interno o el número de Ticket CRM-COR)
export async function onRequestGet({ params, env }) {
  const db = env.DB;
  const idOrCrm = params.id;

  const ticket = await db
    .prepare(
      `SELECT t.*, o.nombre AS oficina_nombre, o.estado AS oficina_estado, o.localidad AS oficina_localidad
       FROM tickets t
       LEFT JOIN oficinas o ON o.id = t.oficina_id
       WHERE t.id = ? OR t.ticket_crm = ?`
    )
    .bind(idOrCrm, idOrCrm)
    .first();

  if (!ticket) return notFound("Ticket no encontrado");

  const puertos = await db
    .prepare("SELECT * FROM ticket_puertos WHERE ticket_id = ? ORDER BY olt, tarjeta, puerto")
    .bind(ticket.id)
    .all();

  return json({ ticket, puertos: puertos.results });
}
