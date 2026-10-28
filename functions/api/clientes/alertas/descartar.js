import { json, badRequest, requireRole, getCurrentUser } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/alertas/descartar  Body: { id, comentario }  (comentario obligatorio)
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json().catch(() => ({}));
  const comentario = String(b.comentario || "").trim();
  if (!comentario) return badRequest("Escribe un comentario para descartar la alerta.");
  const al = await env.DB.prepare("SELECT id, estado FROM alertas_no_reportadas WHERE id = ?").bind(Number(b.id)).first();
  if (!al) return badRequest("La alerta no existe.");
  if (al.estado !== "abierta") return badRequest("Solo se pueden descartar alertas abiertas.");
  const u = await getCurrentUser(env.DB, request);
  await env.DB.prepare("UPDATE alertas_no_reportadas SET estado = 'descartada', comentario = ?, resuelto_por = ? WHERE id = ?")
    .bind(comentario.slice(0, 500), (u && (u.email || u.usuario || u.nombre)) || null, al.id).run();
  return json({ ok: true });
}
