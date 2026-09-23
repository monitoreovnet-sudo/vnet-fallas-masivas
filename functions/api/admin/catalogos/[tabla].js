import { json, badRequest, notFound, requireAdmin } from "../../../_lib/helpers.js";
import { CATALOGOS } from "../../../_lib/catalogos.js";

// GET /api/admin/catalogos/:tabla
export async function onRequestGet({ request, env, params }) {
  await requireAdmin(request, env);
  const config = CATALOGOS[params.tabla];
  if (!config) return notFound(`Catálogo desconocido: ${params.tabla}`);

  const { results } = await env.DB
    .prepare(`SELECT * FROM ${params.tabla} ORDER BY ${config.orden}`)
    .all();
  return json({ filas: results });
}

// POST /api/admin/catalogos/:tabla
export async function onRequestPost({ request, env, params }) {
  await requireAdmin(request, env);
  const config = CATALOGOS[params.tabla];
  if (!config) return notFound(`Catálogo desconocido: ${params.tabla}`);

  const body = await request.json();
  const campos = config.columnas.filter((c) => body[c] !== undefined);
  if (campos.length === 0) return badRequest("No enviaste ningún campo válido.");

  const placeholders = campos.map(() => "?").join(", ");
  const binds = campos.map((c) => body[c]);

  const ins = await env.DB
    .prepare(`INSERT INTO ${params.tabla} (${campos.join(", ")}) VALUES (${placeholders})`)
    .bind(...binds)
    .run();

  return json({ id: ins.meta.last_row_id }, 201);
}
