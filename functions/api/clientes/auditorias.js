import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";

// GET /api/clientes/auditorias -> últimas auditorías con su resumen de cruce (administrador y supervisor)
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.archivo, a.olt_nombre, a.tarjeta, a.puerto, a.estado_filtro, a.fecha_auditoria_local, a.usuario, a.fecha_subida, a.total_onus,
            SUM(o.cuenta IS NOT NULL) cruzadas, SUM(o.clasificacion = 'falla') falla, SUM(o.clasificacion = 'powerfail') powerfail,
            SUM(o.base_desactualizada = 1) desactualizadas
       FROM auditorias a LEFT JOIN auditoria_onus o ON o.auditoria_id = a.id
      WHERE a.total_onus > 0 GROUP BY a.id ORDER BY a.id DESC LIMIT 30`).all();
  return json({ auditorias: results });
}
