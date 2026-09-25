import { json, badRequest, notFound, currentUserEmail, logCambio, nowIso } from "../../../_lib/helpers.js";

// PATCH /api/tickets/:id/editar
// Modo "Edición" de Consultar/Log: permite tocar cualquier campo de
// CABECERA del ticket (no calculado). Semáforo y Tiempo de cierre no están
// aquí porque no son columnas reales — se calculan al vuelo en /api/consulta.
const CAMPOS_PERMITIDOS = [
  "ticket_cmr",
  "tickets_vinculados",
  "fecha_apertura_cda",
  "fecha_apertura_cmr",
  "fecha_solucion_cda",
  "fecha_solucion_cmr",
  "estado_ticket",
  "unidad_resolutoria",
  "categoria_afectacion",
  "afectacion",
  "comentario",
  "descripcion",
  "avance_cmr",
  "oficina_id",
];

export async function onRequestPatch({ request, env, params }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json();

  const ticket = await db
    .prepare("SELECT * FROM tickets WHERE id = ? OR ticket_cmr = ?")
    .bind(params.id, params.id)
    .first();
  if (!ticket) return notFound("Ticket no encontrado");

  const campos = Object.keys(body).filter((k) => CAMPOS_PERMITIDOS.includes(k));
  if (campos.length === 0) {
    return badRequest(`Ningún campo enviado es editable. Permitidos: ${CAMPOS_PERMITIDOS.join(", ")}`);
  }

  if (campos.includes("ticket_cmr")) {
    const nuevoCmr = String(body.ticket_cmr || "").trim();
    if (!/^[0-9]+$/.test(nuevoCmr)) {
      return badRequest("El Ticket CMR-COR debe contener solo números.");
    }
    if (nuevoCmr !== ticket.ticket_cmr) {
      const existente = await db.prepare("SELECT id FROM tickets WHERE ticket_cmr = ? AND id <> ?").bind(nuevoCmr, ticket.id).first();
      if (existente) return badRequest(`Ya existe otro ticket con el número ${nuevoCmr}.`);
    }
    body.ticket_cmr = nuevoCmr;
  }
  if (campos.includes("tickets_vinculados") && body.tickets_vinculados) {
    if (!/^[0-9]+$/.test(String(body.tickets_vinculados).trim())) {
      return badRequest("Tickets Vinculados debe contener solo números.");
    }
  }

  const sets = campos.map((c) => `${c} = ?`).join(", ");
  const binds = campos.map((c) => body[c]);

  await db
    .prepare(`UPDATE tickets SET ${sets}, actualizado_en = ? WHERE id = ?`)
    .bind(...binds, nowIso(), ticket.id)
    .run();

  for (const c of campos) {
    if (String(ticket[c] ?? "") === String(body[c] ?? "")) continue;
    await logCambio(db, {
      ticket_id: ticket.id,
      tipo_cambio: "edicion",
      campo: c,
      valor_anterior: ticket[c],
      valor_nuevo: body[c],
      usuario_email: usuario,
    });
  }

  return json({ ok: true });
}
