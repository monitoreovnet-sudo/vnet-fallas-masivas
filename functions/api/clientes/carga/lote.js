import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { tablaDe, TABLA_OK } from "../../../_lib/sucursal.js";
import { aplicarLote } from "../../../_lib/carga-grafana.js";

const MAX_LOTE = 500;

// POST /api/clientes/carga/lote   Body: { carga_id, filas: [ {cuenta, nombre, ...} ] }
// La base de cada sucursal vive en su propia tabla (llave = número de cuenta). Se REEMPLAZA con el archivo, pero solo se escribe lo que cambió (plan gratuito de D1):
//   * cuenta nueva                       -> se agrega
//   * misma cuenta, mismos datos         -> se salta (no cuesta escritura)
//   * misma cuenta, algún dato distinto  -> se actualiza (ONU nueva, teléfono, dirección, etc.)
// Respuesta: { nuevas, cambiadas, existentes, conflictos: [] }  (ya no hay conflictos entre sucursales: cada una tiene su tabla)
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
  const tabla = await tablaDe(env.DB, carga.sucursal);
  if (!tabla || !TABLA_OK.test(tabla)) return badRequest("La sucursal no tiene tabla (¿falta aplicar la migración 047?).");

  const r = await aplicarLote(env.DB, carga, tabla, filas);
  return json({ ...r, conflictos: [] });
}
