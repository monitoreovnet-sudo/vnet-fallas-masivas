import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES, filaCliente, SQL_INSERT_CLIENTE } from "../../../_lib/clientes.js";

const MAX_LOTE = 500;

// POST /api/clientes/carga/lote   Body: { carga_id, filas: [ {cuenta, nombre, ...} ] }
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const filas = Array.isArray(b.filas) ? b.filas : [];
  if (!filas.length) return badRequest("El lote viene vacío.");
  if (filas.length > MAX_LOTE) return badRequest(`El lote no puede pasar de ${MAX_LOTE} filas.`);
  const carga = await env.DB.prepare("SELECT id, sucursal, estado FROM cargas_base WHERE id = ?").bind(Number(b.carga_id)).first();
  if (!carga) return badRequest("La carga no existe.");
  if (carga.estado !== "cargando") return badRequest("Esta carga ya no admite más filas.");

  const stmts = [];
  for (const f of filas) {
    const p = filaCliente(f || {}, carga.id, carga.sucursal);
    if (p) stmts.push(env.DB.prepare(SQL_INSERT_CLIENTE).bind(...p));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ recibidas: filas.length, enviadas_a_guardar: stmts.length });
}
