import { json, badRequest, requireAdmin } from "../../../_lib/helpers.js";
import { hashPassword } from "../../../_lib/auth.js";

const ROLES_VALIDOS = ["administrador", "supervisor", "observador"];

// GET /api/admin/usuarios
export async function onRequestGet({ request, env }) {
  await requireAdmin(request, env);
  const { results } = await env.DB
    .prepare("SELECT id, email, nombre, rol, activo, (password_hash IS NOT NULL) AS tiene_password FROM usuarios ORDER BY rol, nombre")
    .all();
  return json({ usuarios: results });
}

// POST /api/admin/usuarios
// Body: { email, nombre (alias), rol, password }
// La contraseña es opcional al crear (el admin puede asignarla después
// editando el usuario), pero sin ella la persona no podrá iniciar sesión.
export async function onRequestPost({ request, env }) {
  await requireAdmin(request, env);
  const body = await request.json();
  const email = (body.email || "").trim().toLowerCase();
  const nombre = (body.nombre || "").trim();
  const rol = body.rol;
  const password = body.password || "";

  if (!email || !email.includes("@")) return badRequest("Correo inválido.");
  if (!ROLES_VALIDOS.includes(rol)) return badRequest(`Rol inválido. Debe ser: ${ROLES_VALIDOS.join(", ")}`);
  if (password && password.length < 6) return badRequest("La contraseña debe tener al menos 6 caracteres.");

  const existente = await env.DB.prepare("SELECT id FROM usuarios WHERE email = ?").bind(email).first();
  if (existente) return badRequest("Ya existe un usuario con ese correo.");

  const passwordHash = password ? await hashPassword(password) : null;

  const ins = await env.DB
    .prepare("INSERT INTO usuarios (email, nombre, rol, activo, password_hash) VALUES (?, ?, ?, 1, ?)")
    .bind(email, nombre || null, rol, passwordHash)
    .run();

  return json({ id: ins.meta.last_row_id, email, nombre, rol, activo: 1 }, 201);
}
