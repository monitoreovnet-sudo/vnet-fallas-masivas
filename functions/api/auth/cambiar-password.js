import { json, badRequest, jsonConHeaders } from "../../_lib/helpers.js";
import { usuarioDeSesion, cifrarPassword, descifrarPassword, validarPasswordNueva, crearTokenSesion, cookieSesionHeader } from "../../_lib/auth.js";

// POST /api/auth/cambiar-password   Body: { password, confirmar }
// Primer inicio de sesión: crea la contraseña definitiva (número + mayúscula, especiales libres). Devuelve la sesión normal.
export async function onRequestPost({ request, env }) {
  const sesion = await usuarioDeSesion(request, env);
  if (!sesion) return json({ error: "No autenticado. Inicia sesión." }, 401);
  const b = await request.json().catch(() => ({}));
  const password = String(b.password || ""), confirmar = String(b.confirmar || "");
  if (password !== confirmar) return badRequest("Las dos contraseñas no coinciden.");
  const err = validarPasswordNueva(password);
  if (err) return badRequest(err);
  const u = await env.DB.prepare("SELECT email, nombre, rol, activo, password_cifrada FROM usuarios WHERE email = ?").bind(sesion.email).first();
  if (!u || !u.activo) return json({ error: "No autenticado. Inicia sesión." }, 401);
  if (u.password_cifrada && (await descifrarPassword(u.password_cifrada, env)) === password) return badRequest("La nueva contraseña debe ser distinta de la provisional.");
  await env.DB.prepare("UPDATE usuarios SET password_cifrada = ?, debe_cambiar_password = 0 WHERE email = ?").bind(await cifrarPassword(password, env), u.email).run();
  const token = await crearTokenSesion(u.email, u.rol, env, false);
  return jsonConHeaders({ ok: true, email: u.email, nombre: u.nombre, rol: u.rol }, 200, { "Set-Cookie": cookieSesionHeader(token) });
}
