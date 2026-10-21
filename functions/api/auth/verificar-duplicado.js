import { json, badRequest, forbidden, getCurrentUser } from "../../_lib/helpers.js";
import { verificarPassword, crearTokenDuplicado } from "../../_lib/auth.js";

// POST /api/auth/verificar-duplicado     Body: { password, ticket_cmr }
// El usuario decidió continuar con un ticket que ya existe: se le pide SU contraseña y se le da un permiso de 2 minutos
// (válido solo para ese número de ticket y ese usuario). La contraseña no se guarda en el navegador.
export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const usuario = await getCurrentUser(env.DB, request);
  if (!usuario.rol) return forbidden("No tienes permiso para realizar esta acción.");
  const clave = String(body.password || "");
  const cmr = String(body.ticket_cmr || "");
  if (!clave) return badRequest("Ingresa tu contraseña.");
  if (!/^[0-9]+$/.test(cmr)) return badRequest("Ticket no válido.");
  const fila = await env.DB.prepare("SELECT password_cifrada FROM usuarios WHERE email = ?").bind(usuario.email).first();
  if (!fila || !(await verificarPassword(clave, fila.password_cifrada, env))) {
    return json({ error: "Contraseña incorrecta." }, 403);
  }
  return json({ ok: true, token: await crearTokenDuplicado(usuario.email, cmr, env), minutos: 2 });
}
