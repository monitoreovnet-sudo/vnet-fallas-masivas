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
      `SELECT olt, tarjeta, puerto, serial, cuenta, cedula, nombre, estado, direccion, creado_en,
            cli_cuenta, cli_nombre, cli_cedula, cli_correo, cli_correo_iptv, cli_tel_casa, cli_tel_oficina, cli_direccion, cli_municipio, cli_parroquia,
            cli_sector, cli_estado_contrato, cli_fecha_contrato, cli_sucursal, cruce_metodo, cruce_base_fecha
         FROM ticket_onus WHERE ticket_id = ? ORDER BY olt, CAST(substr(tarjeta, 9) AS INTEGER), CAST(substr(puerto, 8) AS INTEGER), nombre`).bind(ticket.id).all()).results;
  } catch (e) {   // migración 040 sin aplicar: se muestran solo los datos de SmartOLT
    try { onus = (await db.prepare(`SELECT olt, tarjeta, puerto, serial, cuenta, cedula, nombre, estado, direccion, creado_en FROM ticket_onus WHERE ticket_id = ? ORDER BY id`).bind(ticket.id).all()).results; } catch (e2) { /* migración 038 sin aplicar */ }
  }
  return json({ ticket_cmr: ticket.ticket_cmr, onus });
}
