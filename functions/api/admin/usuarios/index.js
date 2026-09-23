import { json, badRequest, requireAdmin } from "../../../_lib/helpers.js";

const ROLES_VALIDOS = ["administrador", "supervisor", "consultor"];

// GET /api/admin/usuarios
export async function onRequestGet({ request, env }) {
  await requireAdmin(request, env);
  const { results } = await env.DB
    .prepare("SELECT id, email, nombre, rol, activo FROM usuarios ORDER BY rol, nombre")
    .all();
  return json({ usuarios: results });
}

// POST /api/admin/usuarios
// Body: { email, nombre, rol }
export async function onRequestPost({ request, env }) {
  await requireAdmin(request, env);
  const body = await request.json();
  const email = (body.email || "").trim().toLowerCase();
  const nombre = (body.nombre || "").trim();
  const rol = body.rol;

  if (!email || !email.includes("@")) return badRequest("Correo inválido.");
  if (!ROLES_VALIDOS.includes(rol)) return badRequest(`Rol inválido. Debe ser: ${ROLES_VALIDOS.join(", ")}`);

  const existente = await env.DB.prepare("SELECT id FROM usuarios WHERE email = ?").bind(email).first();
  if (existente) return badRequest("Ya existe un usuario con ese correo.");

  const ins = await env.DB
    .prepare("INSERT INTO usuarios (email, nombre, rol, activo) VALUES (?, ?, ?, 1)")
    .bind(email, nombre || null, rol)
    .run();

  return json({ id: ins.meta.last_row_id, email, nombre, rol, activo: 1 }, 201);
}
