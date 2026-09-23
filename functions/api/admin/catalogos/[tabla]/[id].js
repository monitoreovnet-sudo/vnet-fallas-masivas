import { json, badRequest, notFound, requireAdmin } from "../../../../_lib/helpers.js";
import { CATALOGOS } from "../../../../_lib/catalogos.js";

// PATCH /api/admin/catalogos/:tabla/:id
export async function onRequestPatch({ request, env, params }) {
  await requireAdmin(request, env);
  const config = CATALOGOS[params.tabla];
  if (!config) return notFound(`Catálogo desconocido: ${params.tabla}`);

  const fila = await env.DB.prepare(`SELECT id FROM ${params.tabla} WHERE id = ?`).bind(params.id).first();
  if (!fila) return notFound("Registro no encontrado.");

  const body = await request.json();
  const campos = config.columnas.filter((c) => body[c] !== undefined);
  if (campos.length === 0) return badRequest("No enviaste ningún campo válido.");

  const sets = campos.map((c) => `${c} = ?`).join(", ");
  const binds = campos.map((c) => body[c]);

  await env.DB.prepare(`UPDATE ${params.tabla} SET ${sets} WHERE id = ?`).bind(...binds, params.id).run();
  return json({ ok: true });
}

// DELETE /api/admin/catalogos/:tabla/:id
export async function onRequestDelete({ request, env, params }) {
  await requireAdmin(request, env);
  const config = CATALOGOS[params.tabla];
  if (!config) return notFound(`Catálogo desconocido: ${params.tabla}`);

  const fila = await env.DB.prepare(`SELECT id FROM ${params.tabla} WHERE id = ?`).bind(params.id).first();
  if (!fila) return notFound("Registro no encontrado.");

  try {
    await env.DB.prepare(`DELETE FROM ${params.tabla} WHERE id = ?`).bind(params.id).run();
  } catch (e) {
    return badRequest("No se puede eliminar: hay registros (tickets/OLTs) que dependen de este valor. Desactívalo en vez de eliminarlo, si el catálogo lo permite.");
  }
  return json({ ok: true });
}
