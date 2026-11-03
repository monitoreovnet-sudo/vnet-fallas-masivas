import { json, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/carga/purgar
// Con la base acumulativa ya no se borra nada al cargar. Se deja la ruta (responde siempre 0 pendientes) para los navegadores con la página anterior.
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  return json({ pendientes: 0 });
}
