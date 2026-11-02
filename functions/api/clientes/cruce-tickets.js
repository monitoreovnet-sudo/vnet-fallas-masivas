import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";

// GET /api/clientes/cruce-tickets -> tickets ABIERTOS con ONUs que todavía no se han cruzado con Grafana (para el cruce automático tras cargar una base)
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const filas = (await env.DB.prepare(
    `SELECT t.id, t.ticket_cmr, COUNT(*) AS pendientes
       FROM tickets t JOIN ticket_onus o ON o.ticket_id = t.id
      WHERE t.estado_ticket NOT IN ('RESUELTO', 'CERRADO') AND o.cli_cuenta IS NULL
      GROUP BY t.id ORDER BY t.id`).all()).results;
  return json({ tickets: filas });
}
