import { json, badRequest, requireRole, currentUserEmail } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES, normSucursal, FECHA_BASE_OK } from "../../../_lib/clientes.js";

// POST /api/clientes/carga/iniciar
// Body: { sucursal, archivo, fecha_base, filas_leidas, filas_descartadas }
// Crea la carga en estado "cargando". La base vigente de la sucursal NO se toca hasta finalizar.
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const sucursal = normSucursal(b.sucursal);
  if (!sucursal) return badRequest("Indica la sucursal.");
  if (!FECHA_BASE_OK.test(String(b.fecha_base || ""))) return badRequest("La fecha de la base no tiene un formato válido.");
  const leidas = Number(b.filas_leidas), desc = Number(b.filas_descartadas);
  if (!Number.isInteger(leidas) || leidas < 1 || !Number.isInteger(desc) || desc < 0 || desc > leidas) return badRequest("Los conteos de filas no son válidos.");
  // Cargas anteriores de esta sucursal que quedaron a medias (se cerró el navegador, etc.): se descartan.
  await env.DB.prepare("UPDATE cargas_base SET estado = 'fallida' WHERE sucursal = ? AND estado = 'cargando'").bind(sucursal).run();
  const r = await env.DB.prepare(
    `INSERT INTO cargas_base (sucursal, archivo, fecha_base, filas_leidas, filas_descartadas, usuario, estado)
     VALUES (?, ?, ?, ?, ?, ?, 'cargando')`)
    .bind(sucursal, String(b.archivo || "").slice(0, 200) || null, b.fecha_base, leidas, desc, currentUserEmail(request)).run();
  return json({ carga_id: r.meta.last_row_id, sucursal, esperadas: leidas - desc }, 201);
}
