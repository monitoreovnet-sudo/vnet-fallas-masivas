import { json, badRequest, notFound, currentUserEmail, nowIso } from "../../../_lib/helpers.js";
import { programarReevaluacion } from "../../../_lib/asociacion.js";

// POST /api/tickets/:id/solucion-cierre      (Editar Ticket → "Solución / Cierre de Ticket", masivo o puntual)
// Body: { alcance: "MASIVO" | "PUNTUAL", registros?: [ids] (solo PUNTUAL),
//         fecha_solucion_cmr, fecha_cierre_cmr, fecha_solucion_cda, fecha_cierre_cda }
//
// PROTECCIÓN DE DATOS: solo se guardan las fechas que llegan llenas. Una fecha vacía se ignora por completo:
// lo que el registro (o el ticket) ya tuviera guardado en ese campo no se toca.
//
// Causa de la falla y correctivo (texto, opcionales): se guardan en cada registro del alcance, con la misma regla de campos vacíos (no se tocan).
//
// ESTADO (se decide por las fechas, en este orden de prioridad):
//   1. Cierre CMR llena                              → CERRADO (todos los registros del alcance).
//   2. Solución CMR llena (sin cierre CMR, y el registro no tiene cierre CMR guardado) → RESUELTO.
//   3. Ninguna fecha del CMR, pero Solución CDA o Cierre CDA llena → RESUELTO.
//   · Si no se llena el cierre CMR, los registros que ya están RESUELTO/CERRADO no se tocan (no se pisan sus fechas).
//   · Si se llena Solución CDA vacía pero sí Cierre CDA, la Solución CDA del registro (si estaba vacía) toma la fecha del cierre CDA.
//   · El ticket pasa a CERRADO cuando todos sus registros están CERRADO, y a RESUELTO cuando no queda ninguno pendiente.
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const YA_RESUELTOS = ["RESUELTO", "CERRADO"];
const vacio = (v) => v === null || v === undefined || String(v).trim() === "";
const mayor = (a, b) => (vacio(a) ? (vacio(b) ? null : b) : vacio(b) ? a : String(a).slice(0, 16) >= String(b).slice(0, 16) ? a : b);

export async function onRequestPost({ request, env, params, waitUntil }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json().catch(() => ({}));

  const ticket = await db.prepare("SELECT * FROM tickets WHERE id = ? OR ticket_cmr = ?").bind(params.id, params.id).first();
  if (!ticket) return notFound("Ticket no encontrado");

  const alcance = body.alcance === "PUNTUAL" ? "PUNTUAL" : body.alcance === "MASIVO" ? "MASIVO" : null;
  if (!alcance) return badRequest("Indica si el cambio es masivo o puntual.");
  const f = (k) => String(body[k] || "").trim() || null;
  const sCmr = f("fecha_solucion_cmr"), cCmr = f("fecha_cierre_cmr"), sCda = f("fecha_solucion_cda"), cCda = f("fecha_cierre_cda");
  const causa = String(body.causa_falla || "").trim().slice(0, 2000) || null, correctivo = String(body.correctivo || "").trim().slice(0, 2000) || null;
  if (!sCmr && !cCmr && !sCda && !cCda) return badRequest("Llena al menos una fecha (solución o cierre).");
  if ([sCmr, cCmr, sCda, cCda].some((v) => v && !FECHA.test(v))) return badRequest("Alguna fecha no tiene un formato válido.");

  const { results: registros } = await db
    .prepare("SELECT id, estado_puerto, fecha_solucion_cmr, fecha_solucion_cda, fecha_cierre_cmr, fecha_cierre_cda, causa_falla, correctivo FROM ticket_puertos WHERE ticket_id = ?")
    .bind(ticket.id).all();

  let candidatos = registros;
  if (alcance === "PUNTUAL") {
    const ids = Array.isArray(body.registros) ? body.registros.map(Number) : [];
    if (!ids.length) return badRequest("Marca al menos un registro.");
    const propios = new Set(registros.map((r) => r.id));
    if (ids.some((id) => !propios.has(id))) return badRequest("Alguno de los registros no pertenece a este ticket.");
    candidatos = registros.filter((r) => ids.includes(r.id));
  }
  const cierra = !!cCmr;
  const objetivos = cierra ? candidatos : candidatos.filter((r) => !YA_RESUELTOS.includes(r.estado_puerto));
  const excluidos = candidatos.length - objetivos.length;
  if (!objetivos.length) {
    return badRequest(alcance === "MASIVO"
      ? "Todos los registros de este ticket ya están resueltos o cerrados: no hay nada que actualizar (para cerrarlos llena la Fecha de Cierre del CMR)."
      : "Los registros marcados ya están resueltos o cerrados: no se modifican (para cerrarlos llena la Fecha de Cierre del CMR).");
  }

  const ahora = nowIso();
  const stmts = [];
  const log = (tipo, campo, anterior, nuevo, registroId = null) => {
    if (String(anterior ?? "") === String(nuevo ?? "")) return;
    stmts.push(
      db.prepare(`INSERT INTO ticket_log (ticket_id, ticket_puerto_id, tipo_cambio, campo, valor_anterior, valor_nuevo, usuario_email) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(ticket.id, registroId, tipo, campo, anterior ?? null, nuevo, usuario)
    );
  };

  const despues = new Map();   // estado y fechas de cada registro tras el cambio (para decidir el estado del ticket)
  registros.forEach((r) => despues.set(r.id, { ...r }));
  let nuevoCmrAlgunoR = false, nuevoCdaAlgunoR = false;
  for (const r of objetivos) {
    const nuevoEstado = cierra || r.estado_puerto === "CERRADO" || !vacio(r.fecha_cierre_cmr) ? "CERRADO" : "RESUELTO";
    // Solución CDA vacía + Cierre CDA llena → la solución toma la fecha del cierre (solo si el registro no tenía solución CDA)
    let solCda = sCda ?? (cCda && vacio(r.fecha_solucion_cda) ? cCda : null);
    // Sincronía CMR ↔ CDA: si una de las dos fechas de solución queda vacía y la otra existe, se duplica.
    let solCmr = sCmr;
    if (vacio(solCmr) && vacio(r.fecha_solucion_cmr)) solCmr = solCda ?? (vacio(r.fecha_solucion_cda) ? null : r.fecha_solucion_cda);
    if (vacio(solCda) && vacio(r.fecha_solucion_cda)) solCda = solCmr ?? (vacio(r.fecha_solucion_cmr) ? null : r.fecha_solucion_cmr);
    if (solCmr) nuevoCmrAlgunoR = true;
    if (solCda) nuevoCdaAlgunoR = true;
    stmts.push(
      db.prepare(
        `UPDATE ticket_puertos SET estado_puerto = ?, fecha_solucion_cmr = COALESCE(?, fecha_solucion_cmr), fecha_cierre_cmr = COALESCE(?, fecha_cierre_cmr),
           fecha_solucion_cda = COALESCE(?, fecha_solucion_cda), fecha_cierre_cda = COALESCE(?, fecha_cierre_cda),
           causa_falla = COALESCE(?, causa_falla), correctivo = COALESCE(?, correctivo), actualizado_en = ? WHERE id = ?`
      ).bind(nuevoEstado, solCmr, cCmr, solCda, cCda, causa, correctivo, ahora, r.id)
    );
    const tipoSol = "solucion", tipoCie = "cierre";
    log(nuevoEstado === "CERRADO" ? tipoCie : tipoSol, "estado_puerto", r.estado_puerto, nuevoEstado, r.id);
    if (solCmr) log(tipoSol, "fecha_solucion_cmr", r.fecha_solucion_cmr, solCmr, r.id);
    if (solCda) log(tipoSol, "fecha_solucion_cda", r.fecha_solucion_cda, solCda, r.id);
    if (cCmr) log(tipoCie, "fecha_cierre_cmr", r.fecha_cierre_cmr, cCmr, r.id);
    if (cCda) log(tipoCie, "fecha_cierre_cda", r.fecha_cierre_cda, cCda, r.id);
    if (causa) log(nuevoEstado === "CERRADO" ? tipoCie : tipoSol, "causa_falla", r.causa_falla, causa, r.id);
    if (correctivo) log(nuevoEstado === "CERRADO" ? tipoCie : tipoSol, "correctivo", r.correctivo, correctivo, r.id);
    despues.set(r.id, {
      ...r, estado_puerto: nuevoEstado,
      fecha_solucion_cmr: solCmr ?? r.fecha_solucion_cmr, fecha_solucion_cda: solCda ?? r.fecha_solucion_cda,
      fecha_cierre_cmr: cCmr ?? r.fecha_cierre_cmr, fecha_cierre_cda: cCda ?? r.fecha_cierre_cda,
    });
  }

  // Estado del ticket
  const todos = [...despues.values()];
  const pendientes = todos.filter((r) => !YA_RESUELTOS.includes(r.estado_puerto)).length;
  const todosCerrados = todos.every((r) => r.estado_puerto === "CERRADO");
  let estadoTicket = null;
  if (todosCerrados) estadoTicket = "CERRADO";
  else if (pendientes === 0) estadoTicket = ticket.estado_ticket === "CERRADO" ? "CERRADO" : "RESUELTO";
  if (estadoTicket) {
    // fechas de solución del ticket: la más reciente de sus registros. Si el usuario no escribió esa fecha, solo se llena cuando el ticket la tenía vacía.
    let tSolCmr = null, tSolCda = null;
    todos.forEach((r) => { tSolCmr = mayor(tSolCmr, r.fecha_solucion_cmr); tSolCda = mayor(tSolCda, r.fecha_solucion_cda); });
    const nuevoSolCmr = tSolCmr && (sCmr || nuevoCmrAlgunoR || vacio(ticket.fecha_solucion_cmr)) ? tSolCmr : null;
    const nuevoSolCda = tSolCda && (sCda || nuevoCdaAlgunoR || vacio(ticket.fecha_solucion_cda)) ? tSolCda : null;
    stmts.push(
      db.prepare(`UPDATE tickets SET estado_ticket = ?, fecha_solucion_cmr = COALESCE(?, fecha_solucion_cmr), fecha_solucion_cda = COALESCE(?, fecha_solucion_cda), actualizado_en = ? WHERE id = ?`)
        .bind(estadoTicket, nuevoSolCmr, nuevoSolCda, ahora, ticket.id)
    );
    log(estadoTicket === "CERRADO" ? "cierre" : "solucion", "estado_ticket", ticket.estado_ticket, estadoTicket);
    if (nuevoSolCmr) log("solucion", "fecha_solucion_cmr", ticket.fecha_solucion_cmr, nuevoSolCmr);
    if (nuevoSolCda) log("solucion", "fecha_solucion_cda", ticket.fecha_solucion_cda, nuevoSolCda);
  }

  await db.batch(stmts);
  await programarReevaluacion({ env, waitUntil }, [params.id]);
  return json({ ok: true, actualizados: objetivos.length, excluidos, pendientes, ticket_estado: estadoTicket || ticket.estado_ticket, ticket_cerrado: estadoTicket === "CERRADO", ticket_resuelto: estadoTicket === "RESUELTO" });
}
