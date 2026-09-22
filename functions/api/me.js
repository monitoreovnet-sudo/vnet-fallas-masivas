import { json, currentUserEmail } from "../_lib/helpers.js";

// GET /api/me
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const email = currentUserEmail(request);

  const usuario = await db
    .prepare("SELECT email, nombre, rol, activo FROM usuarios WHERE email = ?")
    .bind(email)
    .first();

  if (!usuario || !usuario.activo) {
    return json({ email, nombre: null, rol: "consultor", registrado: false });
  }

  return json({ email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, registrado: true });
}
