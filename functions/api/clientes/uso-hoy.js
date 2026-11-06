import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";
import { detalleHoy, esLectura, TOPE_DIA, TOPE_LECT } from "../../_lib/uso-d1.js";

// GET /api/clientes/uso-hoy -> escrituras de D1 del día (todo lo que se sube) frente al tope diario, con el detalle por origen (administrador y supervisor)
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const detalle = await detalleHoy(env.DB);
  const esc = detalle.filter((d) => !esLectura(d)), lec = detalle.filter(esLectura);
  const usado = esc.reduce((s, d) => s + d.filas, 0), leidas = lec.reduce((s, d) => s + d.filas, 0);
  return json({ usado, tope: TOPE_DIA, quedan: Math.max(0, TOPE_DIA - usado), detalle: esc, lecturas: { usado: leidas, tope: TOPE_LECT, detalle: lec } });
}
