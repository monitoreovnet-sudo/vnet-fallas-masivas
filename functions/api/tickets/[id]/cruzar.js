import { json, badRequest, notFound } from "../../../_lib/helpers.js";
import { cruzarTandaTicket } from "../../../_lib/cruce-ticket.js";

// POST /api/tickets/:id/cruzar   Body: { desde_id }
// Cruza una tanda de ONUs del ticket con la base de clientes de Grafana. Solo devuelve conteos (no datos personales), por eso la puede
// disparar cualquier usuario al crear o editar un ticket; los datos del cliente solo los ven administrador y supervisor.
export async function onRequestPost({ request, env, params }) {
  const b = await request.json().catch(() => ({}));
  const ticket = await env.DB.prepare("SELECT id, ticket_cmr, estado_ticket FROM tickets WHERE id = ? OR ticket_cmr = ?").bind(params.id, params.id).first();
  if (!ticket) return notFound("Ticket no encontrado");
  const desde = Number(b.desde_id) || 0;
  if (desde < 0) return badRequest("desde_id no es válido.");
  try {
    return json({ ticket_cmr: ticket.ticket_cmr, ...(await cruzarTandaTicket(env.DB, ticket, desde)) });
  } catch (e) {
    return json({ error: "No se pudo cruzar con Grafana (¿falta aplicar la migración 040?): " + e.message }, 500);
  }
}
