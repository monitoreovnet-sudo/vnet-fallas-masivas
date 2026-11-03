import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";
import { usadoHoy, TOPE_DIA } from "../../_lib/uso-d1.js";

// GET /api/clientes/uso-hoy -> cambios de la base de clientes escritos hoy frente al tope diario (administrador y supervisor)
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const usado = await usadoHoy(env.DB);
  return json({ usado, tope: TOPE_DIA, quedan: Math.max(0, TOPE_DIA - usado) });
}
