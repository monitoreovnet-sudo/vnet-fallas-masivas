import { json, notFound, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// GET /api/tickets/:id/clientes -> clientes afectados del ticket según las auditorías vigentes (administrador y supervisor).
// Devuelve el resumen del ticket, un renglón por puerto físico y la lista de ONUs/clientes (falla, sin electricidad y caída previa).
export async function onRequestGet({ params, request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const db = env.DB;
  const ticket = await db.prepare("SELECT id, ticket_cmr FROM tickets WHERE id = ? OR ticket_cmr = ?").bind(params.id, params.id).first();
  if (!ticket) return notFound("Ticket no encontrado");

  const puertos = (await db.prepare(
    `SELECT ta.olt, ta.tarjeta, ta.puerto, ta.auditoria_id, ta.revisar_duplicado AS duplicado, a.fecha_auditoria_local, a.archivo,
            COUNT(o.id) AS total,
            SUM(o.clasificacion = 'falla') AS falla, SUM(o.clasificacion = 'powerfail') AS sin_luz, SUM(o.clasificacion = 'caida_previa') AS caida_previa,
            SUM(o.clasificacion IN ('falla','powerfail','caida_previa') AND o.cuenta IS NULL) AS sin_cruzar,
            MAX(o.base_desactualizada) AS base_desactualizada
       FROM ticket_auditoria ta
       JOIN auditorias a ON a.id = ta.auditoria_id
       LEFT JOIN auditoria_onus o ON o.auditoria_id = ta.auditoria_id AND o.olt_nombre = ta.olt AND o.tarjeta = ta.tarjeta AND o.puerto = ta.puerto
      WHERE ta.ticket_id = ? AND ta.vigente = 1
      GROUP BY ta.id ORDER BY ta.olt, ta.tarjeta, ta.puerto`).bind(ticket.id).all()).results;

  const onus = (await db.prepare(
    `SELECT o.olt_nombre AS olt, o.tarjeta, o.puerto, o.onu_num, o.status, o.clasificacion, o.last_status_change, o.sn,
            o.cuenta, o.metodo_cruce, o.cli_nombre, o.cli_telefono, o.cli_cedula, o.cli_sector, o.cli_estado_contrato,
            o.name_smartolt, o.contact, o.zona, o.direccion_smartolt, o.base_desactualizada
       FROM ticket_auditoria ta
       JOIN auditoria_onus o ON o.auditoria_id = ta.auditoria_id AND o.olt_nombre = ta.olt AND o.tarjeta = ta.tarjeta AND o.puerto = ta.puerto
      WHERE ta.ticket_id = ? AND ta.vigente = 1 AND o.clasificacion IN ('falla','powerfail','caida_previa')
      ORDER BY o.olt_nombre, o.tarjeta, o.puerto, CAST(o.onu_num AS INTEGER) LIMIT 5000`).bind(ticket.id).all()).results;

  const suma = (k) => puertos.reduce((s, p) => s + (p[k] || 0), 0);
  const resumen = {
    puertos: puertos.length, falla: suma("falla"), sin_luz: suma("sin_luz"), caida_previa: suma("caida_previa"), sin_cruzar: suma("sin_cruzar"),
    duplicado: puertos.some((p) => p.duplicado) ? 1 : 0, base_desactualizada: puertos.some((p) => p.base_desactualizada) ? 1 : 0,
  };
  return json({ ticket, resumen, puertos, onus });
}
