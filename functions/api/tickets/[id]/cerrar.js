import { json, badRequest, notFound, currentUserEmail, logCambio, nowIso } from "../../../_lib/helpers.js";

// POST /api/tickets/:id/cerrar
// Body: { fecha_solucion_cmr, fecha_solucion_cda }
// Únicos campos editables al cerrar. Fija estado_ticket = "CERRADO".
export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json();

  const ticket = await db
    .prepare("SELECT * FROM tickets WHERE id = ? OR ticket_cmr = ?")
    .bind(params.id, params.id)
    .first();
  if (!ticket) return notFound("Ticket no encontrado");

  if (!body.fecha_solucion_cmr || !body.fecha_solucion_cda) {
    return badRequest("Debe indicar la fecha de cierre del CMR y del CDA.");
  }

  await db
    .prepare(
      `UPDATE tickets
       SET fecha_solucion_cmr = ?, fecha_solucion_cda = ?, estado_ticket = 'CERRADO', actualizado_en = ?
       WHERE id = ?`
    )
    .bind(body.fecha_solucion_cmr, body.fecha_solucion_cda, nowIso(), ticket.id)
    .run();

  await logCambio(db, {
    ticket_id: ticket.id,
    tipo_cambio: "cierre",
    campo: "fecha_solucion_cmr",
    valor_anterior: ticket.fecha_solucion_cmr,
    valor_nuevo: body.fecha_solucion_cmr,
    usuario_email: usuario,
  });
  await logCambio(db, {
    ticket_id: ticket.id,
    tipo_cambio: "cierre",
    campo: "fecha_solucion_cda",
    valor_anterior: ticket.fecha_solucion_cda,
    valor_nuevo: body.fecha_solucion_cda,
    usuario_email: usuario,
  });
  await logCambio(db, {
    ticket_id: ticket.id,
    tipo_cambio: "cierre",
    campo: "estado_ticket",
    valor_anterior: ticket.estado_ticket,
    valor_nuevo: "CERRADO",
    usuario_email: usuario,
  });

  return json({ ok: true });
}
