import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";

// GET /api/clientes/bases -> bases vigentes por sucursal + últimas cargas (solo administrador y supervisor)
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const vigentes = await env.DB.prepare(
    `SELECT id, sucursal, archivo, fecha_base, filas_leidas, filas_descartadas, activos, usuario, fecha
       FROM cargas_base WHERE estado = 'vigente' ORDER BY sucursal`).all();
  const historial = await env.DB.prepare(
    `SELECT id, sucursal, archivo, fecha_base, filas_leidas, filas_descartadas, activos, usuario, fecha, estado
       FROM cargas_base ORDER BY id DESC LIMIT 30`).all();
  return json({ vigentes: vigentes.results, historial: historial.results });
}
