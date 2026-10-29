import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";
import { armarFrescura } from "../../_lib/frescura.js";

// GET /api/clientes/frescura -> por cada sucursal con fallas ACTIVAS (tickets que no están Resueltos/Cerrados): cuándo se actualizó su base de Grafana.
// Semáforo (días calendario en hora de Caracas desde la fecha del archivo): 0-1 verde · 2 amarillo · 3 naranja · 4 o más rojo · sin base: rojo.
// La sucursal de Grafana se reconoce con el nombre de la oficina (lo que va después de "XXX - "), su localidad o su estado (DISTRITO CAPITAL = Caracas).
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const oficinas = (await env.DB.prepare(
    `SELECT o.id, o.nombre, o.localidad, o.estado, COUNT(DISTINCT t.id) AS tickets
       FROM tickets t JOIN ticket_puertos p ON p.ticket_id = t.id JOIN oficinas o ON o.id = p.oficina_id
      WHERE t.estado_ticket NOT IN ('RESUELTO', 'CERRADO') AND o.tipo = 'oficina'
      GROUP BY o.id`).all()).results;
  const bases = (await env.DB.prepare("SELECT sucursal, archivo, fecha_base FROM cargas_base WHERE estado = 'vigente'").all()).results;
  const ahora = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 19);
  return json({ filas: armarFrescura(oficinas, bases, ahora), ahora });
}
