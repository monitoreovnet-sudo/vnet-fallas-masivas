import { json, badRequest, notFound, currentUserEmail, nowIso } from "../../../_lib/helpers.js";

// POST /api/tickets/:id/resolver      (Modificar / Cerrar → "Solución de Ticket")
// Body: { alcance: "MASIVO" | "PUNTUAL", fecha_solucion_cmr, fecha_solucion_cda, registros?: [ids] (solo PUNTUAL) }
//   · Cada registro resuelto queda en estado RESUELTO con sus fechas de solución del CMR y del CDA.
//   · Regla de exclusión: los registros que ya están RESUELTO (o CERRADO) NO se tocan, así no se pisan sus fechas originales.
//   · Cuando ya no queda ningún registro pendiente, el ticket pasa a RESUELTO y su fecha de solución es la más reciente
//     entre las de sus registros (es la que usan los informes).
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const YA_RESUELTOS = ["RESUELTO", "CERRADO"];

export async function onRequestPost({ request, env, params }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json();

  const ticket = await db
    .prepare("SELECT * FROM tickets WHERE id = ? OR ticket_cmr = ?")
    .bind(params.id, params.id)
    .first();
  if (!ticket) return notFound("Ticket no encontrado");
  if (ticket.estado_ticket === "CERRADO") return badRequest("Este ticket ya está cerrado: no se le puede registrar una solución.");

  const alcance = body.alcance === "PUNTUAL" ? "PUNTUAL" : body.alcance === "MASIVO" ? "MASIVO" : null;
  if (!alcance) return badRequest("Indica si la solución es masiva o puntual.");
  const cmr = String(body.fecha_solucion_cmr || "").trim();
  const cda = String(body.fecha_solucion_cda || "").trim();
  if (!cmr || !cda) return badRequest("Debe indicar la fecha de solución del CMR y del CDA.");
  if (!FECHA.test(cmr) || !FECHA.test(cda)) return badRequest("Las fechas de solución no tienen un formato válido.");

  const { results: registros } = await db
    .prepare("SELECT id, estado_puerto, fecha_solucion_cmr, fecha_solucion_cda FROM ticket_puertos WHERE ticket_id = ?")
    .bind(ticket.id)
    .all();

  let candidatos = registros;
  if (alcance === "PUNTUAL") {
    const ids = Array.isArray(body.registros) ? body.registros.map(Number) : [];
    if (!ids.length) return badRequest("Marca al menos un registro para resolver.");
    const propios = new Set(registros.map((r) => r.id));
    if (ids.some((id) => !propios.has(id))) return badRequest("Alguno de los registros no pertenece a este ticket.");
    candidatos = registros.filter((r) => ids.includes(r.id));
  }
  const objetivos = candidatos.filter((r) => !YA_RESUELTOS.includes(r.estado_puerto));
  const excluidos = candidatos.length - objetivos.length;
  if (!objetivos.length) {
    return badRequest(alcance === "MASIVO"
      ? "Todos los registros de este ticket ya están resueltos: no hay nada que actualizar."
      : "Los registros marcados ya están resueltos: no se modifican.");
  }

  const ahora = nowIso();
  const stmts = [];
  const log = (campo, anterior, nuevo, registroId = null) => {
    if (String(anterior ?? "") === String(nuevo ?? "")) return;
    stmts.push(
      db.prepare(
        `INSERT INTO ticket_log (ticket_id, ticket_puerto_id, tipo_cambio, campo, valor_anterior, valor_nuevo, usuario_email)
         VALUES (?, ?, 'solucion', ?, ?, ?, ?)`
      ).bind(ticket.id, registroId, campo, anterior ?? null, nuevo, usuario)
    );
  };

  for (const r of objetivos) {
    stmts.push(
      db.prepare(
        `UPDATE ticket_puertos SET estado_puerto = 'RESUELTO', fecha_solucion_cmr = ?, fecha_solucion_cda = ?, actualizado_en = ? WHERE id = ?`
      ).bind(cmr, cda, ahora, r.id)
    );
    log("estado_puerto", r.estado_puerto, "RESUELTO", r.id);
    log("fecha_solucion_cmr", r.fecha_solucion_cmr, cmr, r.id);
    log("fecha_solucion_cda", r.fecha_solucion_cda, cda, r.id);
  }

  // ¿queda algún registro pendiente? (los CERRADO/RESUELTO ya no cuentan)
  const idsObjetivo = new Set(objetivos.map((r) => r.id));
  const pendientes = registros.filter((r) => !idsObjetivo.has(r.id) && !YA_RESUELTOS.includes(r.estado_puerto)).length;
  let ticketResuelto = false;
  if (pendientes === 0) {
    ticketResuelto = true;
    const mayor = (a, b) => (!a ? b : !b ? a : String(a).slice(0, 16) >= String(b).slice(0, 16) ? a : b);
    let solCmr = cmr, solCda = cda;
    for (const r of registros) {
      if (idsObjetivo.has(r.id)) continue;
      solCmr = mayor(solCmr, r.fecha_solucion_cmr);
      solCda = mayor(solCda, r.fecha_solucion_cda);
    }
    stmts.push(
      db.prepare(`UPDATE tickets SET estado_ticket = 'RESUELTO', fecha_solucion_cmr = ?, fecha_solucion_cda = ?, actualizado_en = ? WHERE id = ?`)
        .bind(solCmr, solCda, ahora, ticket.id)
    );
    log("estado_ticket", ticket.estado_ticket, "RESUELTO");
    log("fecha_solucion_cmr", ticket.fecha_solucion_cmr, solCmr);
    log("fecha_solucion_cda", ticket.fecha_solucion_cda, solCda);
  }

  await db.batch(stmts);
  return json({ ok: true, resueltos: objetivos.length, excluidos, pendientes, ticket_resuelto: ticketResuelto });
}
