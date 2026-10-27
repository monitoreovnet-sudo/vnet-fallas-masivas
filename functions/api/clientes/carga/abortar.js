import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/carga/abortar   Body: { carga_id }  -> marca la carga como fallida (la base vigente no se toca)
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const { carga_id } = await request.json();
  const r = await env.DB.prepare("UPDATE cargas_base SET estado = 'fallida' WHERE id = ? AND estado = 'cargando'").bind(Number(carga_id)).run();
  if (!r.meta.changes) return badRequest("No hay una carga en curso con ese número.");
  return json({ ok: true });
}
