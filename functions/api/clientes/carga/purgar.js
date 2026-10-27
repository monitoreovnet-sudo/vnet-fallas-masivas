import { json, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

const TANDA = 4000;

// POST /api/clientes/carga/purgar
// Borra, por tandas, las filas de bases reemplazadas o fallidas. Devuelve cuántas quedan por borrar (el navegador repite hasta 0).
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  await env.DB.prepare(
    `DELETE FROM clientes_base WHERE rowid IN (
       SELECT rowid FROM clientes_base WHERE carga_id IN (SELECT id FROM cargas_base WHERE estado IN ('reemplazada','fallida')) LIMIT ?)`)
    .bind(TANDA).run();
  const r = await env.DB.prepare(
    "SELECT COUNT(*) n FROM clientes_base WHERE carga_id IN (SELECT id FROM cargas_base WHERE estado IN ('reemplazada','fallida'))").first();
  return json({ pendientes: r.n });
}
