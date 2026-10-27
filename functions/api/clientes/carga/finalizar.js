import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/carga/finalizar   Body: { carga_id }
// Comprueba que llegaron TODAS las filas y recién entonces reemplaza la base vigente de la sucursal (en una sola operación).
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const { carga_id } = await request.json();
  const c = await env.DB.prepare("SELECT * FROM cargas_base WHERE id = ?").bind(Number(carga_id)).first();
  if (!c) return badRequest("La carga no existe.");
  if (c.estado !== "cargando") return badRequest("Esta carga ya fue cerrada.");

  const esperadas = c.filas_leidas - c.filas_descartadas;
  const t = await env.DB.prepare(
    `SELECT COUNT(*) n, SUM(CASE WHEN LOWER(estado_contrato) = 'activo' THEN 1 ELSE 0 END) activos
       FROM clientes_base WHERE carga_id = ?`).bind(c.id).first();
  if (t.n !== esperadas) {
    await env.DB.prepare("UPDATE cargas_base SET estado = 'fallida' WHERE id = ?").bind(c.id).run();
    return badRequest(`Llegaron ${t.n} de ${esperadas} filas. La base anterior no se tocó. Intenta de nuevo.`);
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE cargas_base SET estado = 'reemplazada' WHERE sucursal = ? AND estado = 'vigente'").bind(c.sucursal),
    env.DB.prepare("UPDATE cargas_base SET estado = 'vigente', activos = ? WHERE id = ?").bind(t.activos || 0, c.id),
  ]);
  return json({ ok: true, sucursal: c.sucursal, fecha_base: c.fecha_base, filas: t.n, activos: t.activos || 0 });
}
