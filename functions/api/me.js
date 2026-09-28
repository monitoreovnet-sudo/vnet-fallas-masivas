import { json } from "../_lib/helpers.js";
import { usuarioDeSesion } from "../_lib/auth.js";

// GET /api/me
export async function onRequestGet({ request, env }) {
  const sesion = await usuarioDeSesion(request, env);
  if (!sesion) return json({ registrado: false, rol: null }, 401);

  const usuario = await env.DB
    .prepare("SELECT email, nombre, rol, activo FROM usuarios WHERE email = ?")
    .bind(sesion.email)
    .first();

  if (!usuario || !usuario.activo) return json({ registrado: false, rol: null }, 401);

  return json({ email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, registrado: true });
}
