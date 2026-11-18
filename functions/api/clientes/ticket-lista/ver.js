import { json, badRequest, notFound, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// GET /api/clientes/ticket-lista/ver?lista_id=<id>&desde=<n>   -> filas de una lista (tandas de 2.000; "siguiente" = valor de "desde" para la tanda que sigue)
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const q = new URL(request.url).searchParams;
  const id = Number(q.get("lista_id")), desde = Math.max(0, Number(q.get("desde")) || 0);
  if (!id) return badRequest("Falta la lista.");
  const l = await env.DB.prepare("SELECT l.id, l.archivo, l.subido_en, t.ticket_cmr FROM ticket_listas_clientes l JOIN tickets t ON t.id = l.ticket_id WHERE l.id = ?").bind(id).first();
  if (!l) return notFound("La lista no existe.");
  const filas = (await env.DB.prepare(
    `SELECT id AS rid, nombre, telefono, telefono_oficina, correo, contrato, cedula, sucursal, estado, oficina, olt, tarjeta, puerto, sector, municipio, direccion, ubicacion, estatus_grafana, estatus_smartolt, serial, visto
       FROM ticket_lista_filas WHERE lista_id = ? AND id > ? ORDER BY id LIMIT 2000`).bind(id, desde).all()).results;
  return json({ lista: l, filas, siguiente: filas.length === 2000 ? filas[filas.length - 1].rid : null });
}
