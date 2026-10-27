import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/auditoria/abortar   Body: { auditoria_id } -> descarta una auditoría a medias
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const { auditoria_id } = await request.json();
  const aud = await env.DB.prepare("SELECT id, total_onus FROM auditorias WHERE id = ?").bind(Number(auditoria_id)).first();
  if (!aud) return badRequest("La auditoría no existe.");
  if (aud.total_onus > 0) return badRequest("Esa auditoría ya fue completada.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auditoria_onus WHERE auditoria_id = ?").bind(aud.id),
    env.DB.prepare("DELETE FROM auditorias WHERE id = ?").bind(aud.id),
  ]);
  return json({ ok: true });
}
