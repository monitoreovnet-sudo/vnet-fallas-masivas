import { json, notFound, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// GET /api/tickets/:id/onus -> ONUs (clientes) registradas al crear el ticket con los archivos de SmartOLT
// (serial, cuenta, cédula si la traían, nombre, estado). Solo administrador y supervisor (son datos de clientes).
export async function onRequestGet({ params, request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const db = env.DB;
  const ticket = await db.prepare("SELECT id, ticket_cmr FROM tickets WHERE id = ? OR ticket_cmr = ?").bind(params.id, params.id).first();
  if (!ticket) return notFound("Ticket no encontrado");
  let onus = [];
  try {
    onus = (await db.prepare(
      `SELECT olt, tarjeta, puerto, serial, cuenta, cedula, nombre, estado, direccion, creado_en
         FROM ticket_onus WHERE ticket_id = ? ORDER BY olt, CAST(substr(tarjeta, 9) AS INTEGER), CAST(substr(puerto, 8) AS INTEGER), nombre`).bind(ticket.id).all()).results;
  } catch (e) { /* migración 038 sin aplicar */ }
  return json({ ticket_cmr: ticket.ticket_cmr, onus });
}
