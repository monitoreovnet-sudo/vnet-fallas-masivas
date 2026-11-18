import { json, badRequest, notFound, requireRole, getCurrentUser, nowIso } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { registrarUso, escrituras } from "../../../_lib/uso-d1.js";

const MAX_LOTE = 500;
const CAMPOS = ["nombre", "telefono", "telefono_oficina", "correo", "contrato", "cedula", "sucursal", "estado", "oficina", "olt", "tarjeta", "puerto", "sector", "municipio", "direccion", "ubicacion", "estatus_grafana", "estatus_smartolt", "serial", "visto"];

// POST /api/clientes/ticket-lista/lote
//   Primer envío:  { ticket, archivo, filas: [...] }          -> crea la lista nueva (con fecha y hora) y guarda las primeras filas
//   Siguientes:    { lista_id, filas: [...] }                 -> agrega más filas a esa lista
// Cada lote se guarda con UNA sola sentencia (sin leer nada de la base): solo cuesta escrituras.
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const filas = Array.isArray(b.filas) ? b.filas : [];
  if (filas.length > MAX_LOTE) return badRequest(`El lote no puede pasar de ${MAX_LOTE} filas.`);
  let listaId = Number(b.lista_id) || 0;
  if (!listaId) {
    const t = await env.DB.prepare("SELECT id FROM tickets WHERE ticket_cmr = ?").bind(String(b.ticket || "").trim()).first();
    if (!t) return notFound("Ese ticket no existe.");
    const r = await env.DB.prepare("INSERT INTO ticket_listas_clientes (ticket_id, archivo, subido_por, subido_en) VALUES (?, ?, ?, ?)")
      .bind(t.id, String(b.archivo || "").slice(0, 200), (await getCurrentUser(env.DB, request)).email || null, nowIso()).run();
    listaId = r.meta.last_row_id;
    await registrarUso(env.DB, "ticket_onus", escrituras(r));
  }
  if (filas.length) {
    const datos = filas.map((f) => CAMPOS.map((c) => (f && f[c] != null ? String(f[c]).slice(0, 300) : null)));
    const sql = `INSERT INTO ticket_lista_filas (lista_id, ${CAMPOS.join(", ")})
      SELECT ?, ${CAMPOS.map((_, i) => `json_extract(value, '$[${i}]')`).join(", ")} FROM json_each(?)`;
    const r = await env.DB.prepare(sql).bind(listaId, JSON.stringify(datos)).run();
    await registrarUso(env.DB, "ticket_onus", escrituras(r));
  }
  return json({ lista_id: listaId, recibidas: filas.length });
}
