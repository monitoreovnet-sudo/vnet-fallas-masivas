import { json, badRequest, notFound, currentUserEmail, nowIso } from "../../../_lib/helpers.js";

// POST /api/tickets/:id/cerrar        (Modificar / Cerrar → "Cierre de Ticket": siempre masivo)
// Body: { fecha_cierre_cmr, fecha_cierre_cda }
//   · TODOS los registros del ticket quedan CERRADO con esas fechas de cierre.
//   · El ticket queda en estado CERRADO.
//   · Si el ticket no tiene Fecha de Solución del CDA, se llena con la Fecha de Cierre del CDA.
//   · La Fecha de Cierre del CMR se guarda tal cual; no hereda nada ni toca la solución del CMR.
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const vacio = (v) => v === null || v === undefined || String(v).trim() === "";

export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json();

  const ticket = await db
    .prepare("SELECT * FROM tickets WHERE id = ? OR ticket_cmr = ?")
    .bind(params.id, params.id)
    .first();
  if (!ticket) return notFound("Ticket no encontrado");

  const cmr = String(body.fecha_cierre_cmr || "").trim();
  const cda = String(body.fecha_cierre_cda || "").trim();
  if (!cmr || !cda) return badRequest("Debe indicar la fecha de cierre del CMR y del CDA.");
  if (!FECHA.test(cmr) || !FECHA.test(cda)) return badRequest("Las fechas de cierre no tienen un formato válido.");

  const { results: registros } = await db
    .prepare("SELECT id, estado_puerto, fecha_cierre_cmr, fecha_cierre_cda FROM ticket_puertos WHERE ticket_id = ?")
    .bind(ticket.id)
    .all();

  const ahora = nowIso();
  const stmts = [];
  const log = (campo, anterior, nuevo, registroId = null) => {
    if (String(anterior ?? "") === String(nuevo ?? "")) return;
    stmts.push(
      db.prepare(
        `INSERT INTO ticket_log (ticket_id, ticket_puerto_id, tipo_cambio, campo, valor_anterior, valor_nuevo, usuario_email)
         VALUES (?, ?, 'cierre', ?, ?, ?, ?)`
      ).bind(ticket.id, registroId, campo, anterior ?? null, nuevo, usuario)
    );
  };

  stmts.push(
    db.prepare(
      `UPDATE ticket_puertos SET estado_puerto = 'CERRADO', fecha_cierre_cmr = ?, fecha_cierre_cda = ?, actualizado_en = ? WHERE ticket_id = ?`
    ).bind(cmr, cda, ahora, ticket.id)
  );
  for (const r of registros) {
    log("estado_puerto", r.estado_puerto, "CERRADO", r.id);
    log("fecha_cierre_cmr", r.fecha_cierre_cmr, cmr, r.id);
    log("fecha_cierre_cda", r.fecha_cierre_cda, cda, r.id);
  }

  const solucionCda = vacio(ticket.fecha_solucion_cda) ? cda : ticket.fecha_solucion_cda;
  stmts.push(
    db.prepare(`UPDATE tickets SET estado_ticket = 'CERRADO', fecha_solucion_cda = ?, actualizado_en = ? WHERE id = ?`)
      .bind(solucionCda, ahora, ticket.id)
  );
  log("estado_ticket", ticket.estado_ticket, "CERRADO");
  if (vacio(ticket.fecha_solucion_cda)) log("fecha_solucion_cda", null, solucionCda);

  await db.batch(stmts);
  return json({ ok: true, registros: registros.length, fecha_solucion_cda_copiada: vacio(ticket.fecha_solucion_cda) });
}
