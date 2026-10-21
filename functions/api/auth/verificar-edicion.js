import { json, badRequest, forbidden, getCurrentUser } from "../../_lib/helpers.js";
import { verificarPassword, crearTokenEdicion } from "../../_lib/auth.js";

// POST /api/auth/verificar-edicion     Body: { password }
// Paso previo a "Editar como cuadro de Excel": solo administrador y supervisor, volviendo a escribir SU contraseña.
// Si es correcta devuelve un permiso temporal (30 min) que el guardado exige; la contraseña no se guarda en el navegador.
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const usuario = await getCurrentUser(env.DB, request);
  if (!usuario.rol || !["administrador", "supervisor"].includes(usuario.rol)) {
    return forbidden("Solo administradores y supervisores pueden editar la tabla.");
  }
  const clave = String(body.password || "");
  if (!clave) return badRequest("Ingresa tu contraseña.");
  const fila = await env.DB.prepare("SELECT password_cifrada FROM usuarios WHERE email = ?").bind(usuario.email).first();
  if (!fila || !(await verificarPassword(clave, fila.password_cifrada, env))) {
    return json({ error: "Contraseña incorrecta." }, 403);
  }
  return json({ ok: true, token: await crearTokenEdicion(usuario.email, env), minutos: 30 });
}
