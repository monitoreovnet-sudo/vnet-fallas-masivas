import { json, badRequest, notFound, requireAdmin } from "../../../_lib/helpers.js";
import { CATALOGOS, ENLACES, idsDe, guardarEnlaces } from "../../../_lib/catalogos.js";

// GET /api/admin/catalogos/:tabla
export async function onRequestGet({ request, env, params }) {
  await requireAdmin(request, env);
  const config = CATALOGOS[params.tabla];
  if (!config) return notFound(`Catálogo desconocido: ${params.tabla}`);

  const { results } = await env.DB
    .prepare(`SELECT * FROM ${params.tabla} ORDER BY ${config.orden}`)
    .all();
  const enlace = ENLACES[params.tabla];
  if (enlace) {
    let rel = [];
    try { rel = (await env.DB.prepare(`SELECT ${enlace.col} AS a, ${enlace.otro} AS b FROM ${enlace.tabla}`).all()).results; } catch (e) { rel = []; }
    const mapa = new Map();
    rel.forEach((r) => { if (!mapa.has(r.a)) mapa.set(r.a, []); mapa.get(r.a).push(r.b); });
    results.forEach((f) => {
      let ids = mapa.get(f.id) || [];
      if (!ids.length && enlace.legado && f[enlace.legado]) ids = [f[enlace.legado]];
      f[enlace.campo] = ids;
    });
  }
  return json({ filas: results });
}

// POST /api/admin/catalogos/:tabla
export async function onRequestPost({ request, env, params }) {
  await requireAdmin(request, env);
  const config = CATALOGOS[params.tabla];
  if (!config) return notFound(`Catálogo desconocido: ${params.tabla}`);

  const body = await request.json();
  const enlace = ENLACES[params.tabla];
  const ids = enlace ? idsDe(body, enlace) : undefined;
  if (enlace && enlace.obligatorio && (!ids || !ids.length)) return badRequest("Selecciona al menos una opción en la lista de selección múltiple.");
  if (enlace && enlace.legado && ids) body[enlace.legado] = ids.length ? ids[0] : null;
  const campos = config.columnas.filter((c) => body[c] !== undefined);
  if (campos.length === 0) return badRequest("No enviaste ningún campo válido.");

  const placeholders = campos.map(() => "?").join(", ");
  const binds = campos.map((c) => body[c]);

  const ins = await env.DB
    .prepare(`INSERT INTO ${params.tabla} (${campos.join(", ")}) VALUES (${placeholders})`)
    .bind(...binds)
    .run();

  if (enlace && ids) await guardarEnlaces(env, enlace, ins.meta.last_row_id, ids);
  return json({ id: ins.meta.last_row_id }, 201);
}
