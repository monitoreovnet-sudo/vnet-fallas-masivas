import { jsonConHeaders, json, badRequest } from "../../_lib/helpers.js";
import { verificarPassword, crearTokenSesion, cookieSesionHeader } from "../../_lib/auth.js";

// POST /api/auth/login
// Body: { email, password }
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) return badRequest("Correo y contraseña son obligatorios.");

  const usuario = await env.DB
    .prepare("SELECT email, nombre, rol, activo, password_cifrada, debe_cambiar_password FROM usuarios WHERE email = ?")
    .bind(email)
    .first();

  // Mensaje genérico en ambos casos (correo no existe / contraseña incorrecta)
  // para no revelar qué correos están registrados.
  const credencialesInvalidas = () => json({ error: "Correo o contraseña incorrectos." }, 401);

  if (!usuario || !usuario.activo || !usuario.password_cifrada) return credencialesInvalidas();

  const ok = await verificarPassword(password, usuario.password_cifrada, env);
  if (!ok) return credencialesInvalidas();

  const debeCambiar = usuario.debe_cambiar_password === 1 || usuario.debe_cambiar_password === null;
  // Primer inicio de sesión: la sesión solo sirve para crear la contraseña (el middleware bloquea el resto).
  const token = await crearTokenSesion(usuario.email, usuario.rol, env, debeCambiar);

  return jsonConHeaders(
    { email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, ...(debeCambiar ? { debe_cambiar: true } : {}) },
    200,
    { "Set-Cookie": cookieSesionHeader(token) }
  );
}
