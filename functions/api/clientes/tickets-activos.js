import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";

// GET /api/clientes/tickets-activos -> tickets con falla activa (no RESUELTO ni CERRADO) y si sus clientes se cruzaron con Grafana.
// Un ticket cuenta como "cruzado" si al menos una de sus ONUs (las guardadas con el ticket, o las de su auditoría vigente de SmartOLT) tiene cliente.
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const filas = (await env.DB.prepare(
    `SELECT t.id, t.ticket_cmr, t.estado_ticket,
            (SELECT group_concat(DISTINCT of.nombre) FROM ticket_puertos p JOIN oficinas of ON of.id = p.oficina_id WHERE p.ticket_id = t.id) AS oficinas,
            (SELECT COUNT(*) FROM ticket_onus x WHERE x.ticket_id = t.id) AS onus_total,
            (SELECT COUNT(*) FROM ticket_onus x WHERE x.ticket_id = t.id AND x.cli_cuenta IS NOT NULL) AS onus_cruzadas,
            (SELECT COUNT(*) FROM ticket_auditoria ta JOIN auditoria_onus o ON o.auditoria_id = ta.auditoria_id AND o.olt_nombre = ta.olt AND o.tarjeta = ta.tarjeta AND o.puerto = ta.puerto
              WHERE ta.ticket_id = t.id AND ta.vigente = 1 AND o.clasificacion IN ('falla', 'powerfail')) AS aud_total,
            (SELECT COUNT(*) FROM ticket_auditoria ta JOIN auditoria_onus o ON o.auditoria_id = ta.auditoria_id AND o.olt_nombre = ta.olt AND o.tarjeta = ta.tarjeta AND o.puerto = ta.puerto
              WHERE ta.ticket_id = t.id AND ta.vigente = 1 AND o.clasificacion IN ('falla', 'powerfail') AND o.cuenta IS NOT NULL) AS aud_cruzadas
       FROM tickets t
      WHERE t.estado_ticket NOT IN ('RESUELTO', 'CERRADO')
      ORDER BY t.ticket_cmr DESC`).all()).results;
  const tickets = filas.map((r) => {
    const usaOnus = r.onus_total > 0;
    return {
      ticket_cmr: r.ticket_cmr, estado_ticket: r.estado_ticket, oficinas: r.oficinas || "",
      total: usaOnus ? r.onus_total : r.aud_total, cruzadas: usaOnus ? r.onus_cruzadas : r.aud_cruzadas,
      cruzado: r.onus_cruzadas > 0 || r.aud_cruzadas > 0,
    };
  });
  return json({ tickets, cruzados: tickets.filter((t) => t.cruzado).length, sin_cruzar: tickets.filter((t) => !t.cruzado).length });
}
