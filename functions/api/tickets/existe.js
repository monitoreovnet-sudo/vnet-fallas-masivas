import { json, badRequest } from "../../_lib/helpers.js";

// GET /api/tickets/existe?cmr=326159  → { existe: true|false, ticket_cmr }
// Coincidencia exacta por número de Ticket CMR-COR (para avisar antes de crear un ticket repetido).
export async function onRequestGet({ request, env }) {
  const cmr = String(new URL(request.url).searchParams.get("cmr") || "").trim();
  if (!/^[0-9]+$/.test(cmr)) return badRequest("Número de ticket no válido.");
  const fila = await env.DB.prepare("SELECT id FROM tickets WHERE ticket_cmr = ?").bind(cmr).first();
  return json({ existe: !!fila, ticket_cmr: cmr });
}
