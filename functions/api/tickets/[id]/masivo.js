import { json, badRequest, notFound, currentUserEmail, logCambio, nowIso } from "../../../_lib/helpers.js";

// PATCH /api/tickets/:id/masivo
// Único endpoint autorizado a tocar estos campos a la vez, replicando
// exactamente los campos editables de la pantalla "Cambiar Todo el Ticket":
//   estado_ticket, olt (aplica a TODOS los puertos del ticket), avance_cmr,
//   fecha_apertura_cda, fecha_apertura_cmr, unidad_resolutoria, oficina_id
const CAMPOS_PERMITIDOS = [
  "estado_ticket",
  "olt",
  "avance_cmr",
  "fecha_apertura_cda",
  "fecha_apertura_cmr",
  "unidad_resolutoria",
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
    return badRequest(`Ningún campo enviado es editable en modificación masiva. Permitidos: ${CAMPOS_PERMITIDOS.join(", ")}`);
  }

  // "olt" es un caso especial: no es columna de tickets, se propaga a TODOS
  // los ticket_puertos del ticket.
  const camposTicket = campos.filter((c) => c !== "olt");

  if (camposTicket.length > 0) {
    const sets = camposTicket.map((c) => `${c} = ?`).join(", ");
    const binds = camposTicket.map((c) => body[c]);
    await db
      .prepare(`UPDATE tickets SET ${sets}, actualizado_en = ? WHERE id = ?`)
      .bind(...binds, nowIso(), ticket.id)
      .run();

    for (const c of camposTicket) {
      await logCambio(db, {
        ticket_id: ticket.id,
        tipo_cambio: "masivo",
        campo: c,
        valor_anterior: ticket[c],
        valor_nuevo: body[c],
        usuario_email: usuario,
      });
    }
  }

  if (campos.includes("olt")) {
    const puertosAnteriores = await db
      .prepare("SELECT id, olt FROM ticket_puertos WHERE ticket_id = ?")
      .bind(ticket.id)
      .all();

    await db.prepare("UPDATE ticket_puertos SET olt = ?, actualizado_en = ? WHERE ticket_id = ?")
      .bind(body.olt, nowIso(), ticket.id)
      .run();

    for (const p of puertosAnteriores.results) {
      await logCambio(db, {
        ticket_id: ticket.id,
        ticket_puerto_id: p.id,
        tipo_cambio: "masivo",
        campo: "olt",
        valor_anterior: p.olt,
        valor_nuevo: body.olt,
        usuario_email: usuario,
      });
    }
  }

  return json({ ok: true });
}
