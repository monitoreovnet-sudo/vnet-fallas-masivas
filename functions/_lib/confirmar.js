import { json, badRequest, requireAdmin } from "./helpers.js";
import { verificarPassword } from "./auth.js";

// Confirmación de operaciones destructivas: exige que quien llama sea administrador
// Y que escriba SU propia contraseña. Devuelve { admin } o { error: Response }.
export async function confirmarAdminConClave(request, env, password) {
  const admin = await requireAdmin(request, env);          // lanza 403 si no es administrador
  const clave = String(password || "");
  if (!clave) return { error: badRequest("Ingresa tu contraseña para confirmar.") };
  const fila = await env.DB.prepare("SELECT password_cifrada FROM usuarios WHERE email = ?").bind(admin.email).first();
  const ok = !!fila && (await verificarPassword(clave, fila.password_cifrada, env));
  if (!ok) return { error: json({ error: "Contraseña incorrecta. No se eliminó nada." }, 403) };
  return { admin };
}
