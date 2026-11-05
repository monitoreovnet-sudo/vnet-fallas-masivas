import { json, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { presupuestoNoche, TOPE_NOCHE } from "../../../_lib/cola-noche.js";

// GET /api/clientes/cola/estado -> cargas en cola (y las terminadas hace poco) + cupo de la noche
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const filas = (await env.DB.prepare(
    `SELECT q.carga_id, c.sucursal, c.archivo, c.fecha_base, q.estado, q.total_chunks, q.sig, q.cuentas_chunks, q.completa, q.filas,
            q.nuevas, q.cambiadas, q.existentes, q.bajas, q.total_base, q.error, q.creado, q.actualizado
       FROM cola_cargas q JOIN cargas_base c ON c.id = q.carga_id
      WHERE q.estado IN ('subiendo','pendiente','espera_confirmacion') OR q.actualizado >= datetime('now', '-3 days')
      ORDER BY q.carga_id DESC LIMIT 60`).all()).results;
  const p = await presupuestoNoche(env.DB);
  return json({ cargas: filas, usado_noche: p.usadoNoche, tope_noche: TOPE_NOCHE, quedan: p.restante, cron_configurado: !!(env.CRON_TOKEN && String(env.CRON_TOKEN).length >= 16) });
}
