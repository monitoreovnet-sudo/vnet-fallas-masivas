import { json, badRequest, notFound, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// GET /api/clientes/ticket-lista/info?ticket=<N° CMR>
// Devuelve cuántos clientes afectados tiene REGISTRADOS el ticket (suma de sus registros) y las listas ya subidas (más reciente primero).
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const tk = (new URL(request.url).searchParams.get("ticket") || "").trim();
  if (!tk) return badRequest("Escribe el número de ticket.");
  const t = await env.DB.prepare("SELECT id, ticket_cmr FROM tickets WHERE ticket_cmr = ?").bind(tk).first();
  if (!t) return notFound("Ese ticket no existe.");
  const reg = await env.DB.prepare("SELECT COUNT(*) AS registros, COALESCE(SUM(nro_clientes_afectados),0) AS afectados FROM ticket_puertos WHERE ticket_id = ?").bind(t.id).first();
  const listas = (await env.DB.prepare(
    "SELECT id, archivo, total, aplicada, subido_por, subido_en FROM ticket_listas_clientes WHERE ticket_id = ? AND estado = 'lista' ORDER BY id DESC LIMIT 50").bind(t.id).all()).results;
  return json({ ticket: t, registros: reg.registros, registrados: reg.afectados, listas });
}
