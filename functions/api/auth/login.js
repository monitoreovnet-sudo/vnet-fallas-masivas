import { jsonConHeaders, json, badRequest } from "../../_lib/helpers.js";
import { verifyPassword, crearTokenSesion, cookieSesionHeader } from "../../_lib/auth.js";

// POST /api/auth/login
// Body: { email, password }
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) return badRequest("Correo y contraseña son obligatorios.");

  const usuario = await env.DB
    .prepare("SELECT email, nombre, rol, activo, password_hash FROM usuarios WHERE email = ?")
    .bind(email)
    .first();

  // Mensaje genérico en ambos casos (correo no existe / contraseña incorrecta)
  // para no revelar qué correos están registrados.
  const credencialesInvalidas = () => json({ error: "Correo o contraseña incorrectos." }, 401);

  if (!usuario || !usuario.activo || !usuario.password_hash) return credencialesInvalidas();

  const ok = await verifyPassword(password, usuario.password_hash);
  if (!ok) return credencialesInvalidas();

  const token = await crearTokenSesion(usuario.email, usuario.rol, env);

  return jsonConHeaders(
    { email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
    200,
    { "Set-Cookie": cookieSesionHeader(token) }
  );
}
