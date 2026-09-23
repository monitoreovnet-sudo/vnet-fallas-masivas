import { json, badRequest, notFound, requireAdmin } from "../../../_lib/helpers.js";

const ROLES_VALIDOS = ["administrador", "supervisor", "consultor"];

// PATCH /api/admin/usuarios/:id
// Body: cualquier combinación de { nombre, rol, activo }
export async function onRequestPatch({ request, env, params }) {
  await requireAdmin(request, env);
  const body = await request.json();

  const usuario = await env.DB.prepare("SELECT id FROM usuarios WHERE id = ?").bind(params.id).first();
  if (!usuario) return notFound("Usuario no encontrado.");

  const campos = [];
  const binds = [];

  if (body.nombre !== undefined) { campos.push("nombre = ?"); binds.push(body.nombre); }
  if (body.rol !== undefined) {
    if (!ROLES_VALIDOS.includes(body.rol)) return badRequest(`Rol inválido. Debe ser: ${ROLES_VALIDOS.join(", ")}`);
    campos.push("rol = ?"); binds.push(body.rol);
  }
  if (body.activo !== undefined) { campos.push("activo = ?"); binds.push(body.activo ? 1 : 0); }

  if (campos.length === 0) return badRequest("No enviaste ningún campo para actualizar.");

  await env.DB.prepare(`UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`).bind(...binds, params.id).run();
  return json({ ok: true });
}

// DELETE /api/admin/usuarios/:id
export async function onRequestDelete({ request, env, params }) {
  await requireAdmin(request, env);
  const usuario = await env.DB.prepare("SELECT id FROM usuarios WHERE id = ?").bind(params.id).first();
  if (!usuario) return notFound("Usuario no encontrado.");

  await env.DB.prepare("DELETE FROM usuarios WHERE id = ?").bind(params.id).run();
  return json({ ok: true });
}
