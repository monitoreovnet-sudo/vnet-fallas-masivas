import { json, badRequest, notFound, currentUserEmail, nowIso } from "../../../_lib/helpers.js";
import { programarReevaluacion } from "../../../_lib/asociacion.js";

// POST /api/tickets/:id/cerrar        (Modificar / Cerrar → "Cierre de Ticket": siempre masivo)
// Body: { fecha_cierre_cmr, fecha_cierre_cda }
//   · TODOS los registros del ticket quedan CERRADO con las fechas de cierre que se indiquen (CMR, CDA o ambas;
//     la que no se indique conserva lo que ya tenía cada registro).
//   · El ticket queda en estado CERRADO.
//   · Si el ticket no tiene Fecha de Solución del CDA y se indicó la Fecha de Cierre del CDA, se llena con ella.
//   · La Fecha de Cierre del CMR se guarda tal cual; no hereda nada ni toca la solución del CMR.
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const vacio = (v) => v === null || v === undefined || String(v).trim() === "";

export async function onRequestPost({ request, env, params, waitUntil }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json();

  const ticket = await db
    .prepare("SELECT * FROM tickets WHERE id = ? OR ticket_cmr = ?")
    .bind(params.id, params.id)
    .first();
  if (!ticket) return notFound("Ticket no encontrado");

  // Se puede indicar una sola de las dos fechas: la que no se envía se deja como estaba en cada registro.
  const cmr = String(body.fecha_cierre_cmr || "").trim() || null;
  const cda = String(body.fecha_cierre_cda || "").trim() || null;
  if (!cmr && !cda) return badRequest("Debe indicar al menos una fecha de cierre (CMR o CDA).");
  if ((cmr && !FECHA.test(cmr)) || (cda && !FECHA.test(cda))) return badRequest("Las fechas de cierre no tienen un formato válido.");

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
      `UPDATE ticket_puertos SET estado_puerto = 'CERRADO', fecha_cierre_cmr = COALESCE(?, fecha_cierre_cmr), fecha_cierre_cda = COALESCE(?, fecha_cierre_cda), actualizado_en = ? WHERE ticket_id = ?`
    ).bind(cmr, cda, ahora, ticket.id)
  );
  for (const r of registros) {
    log("estado_puerto", r.estado_puerto, "CERRADO", r.id);
    if (cmr) log("fecha_cierre_cmr", r.fecha_cierre_cmr, cmr, r.id);
    if (cda) log("fecha_cierre_cda", r.fecha_cierre_cda, cda, r.id);
  }

  const copiar = vacio(ticket.fecha_solucion_cda) && !!cda;
  const solucionCda = copiar ? cda : ticket.fecha_solucion_cda;
  stmts.push(
    db.prepare(`UPDATE tickets SET estado_ticket = 'CERRADO', fecha_solucion_cda = ?, actualizado_en = ? WHERE id = ?`)
      .bind(solucionCda, ahora, ticket.id)
  );
  log("estado_ticket", ticket.estado_ticket, "CERRADO");
  if (copiar) log("fecha_solucion_cda", null, solucionCda);

  await db.batch(stmts);
  await programarReevaluacion({ env, waitUntil }, [params.id]);
  return json({ ok: true, registros: registros.length, fecha_solucion_cda_copiada: copiar });
}
