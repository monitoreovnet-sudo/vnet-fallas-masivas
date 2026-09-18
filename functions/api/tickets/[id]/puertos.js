import { json, badRequest, notFound, currentUserEmail, logCambio, nowIso } from "../../../_lib/helpers.js";

// PATCH /api/tickets/:id/puertos
// Body: { puertos: [{ id, oficina_id, olt, tarjeta, puerto, estado_puerto,
//                      fecha_cierre_cmr, fecha_cierre_cda }, ...] }
// Único endpoint autorizado a tocar estos campos a nivel de puerto individual.
// Cubre dos escenarios de la pantalla unificada "Modificar / Cerrar Ticket":
//  - Modificación por Puertos: oficina_id, olt, tarjeta, puerto, estado_puerto
//  - Cierre por Puertos: estado_puerto = 'CERRADO' + fecha_cierre_cmr/cda
const CAMPOS_PERMITIDOS = [
  "oficina_id",
  "olt",
  "tarjeta",
  "puerto",
  "estado_puerto",
  "fecha_cierre_cmr",
  "fecha_cierre_cda",
];

export async function onRequestPatch({ request, env, params }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json();

  const ticket = await db
    .prepare("SELECT id FROM tickets WHERE id = ? OR ticket_cmr = ?")
    .bind(params.id, params.id)
    .first();
  if (!ticket) return notFound("Ticket no encontrado");

  if (!Array.isArray(body.puertos) || body.puertos.length === 0) {
    return badRequest("Debe indicar al menos un puerto a modificar.");
  }

  for (const cambio of body.puertos) {
    if (!cambio.id) continue;

    const actual = await db
      .prepare("SELECT * FROM ticket_puertos WHERE id = ? AND ticket_id = ?")
      .bind(cambio.id, ticket.id)
      .first();
    if (!actual) continue;

    const campos = Object.keys(cambio).filter((k) => CAMPOS_PERMITIDOS.includes(k));
    if (campos.length === 0) continue;

    const sets = campos.map((c) => `${c} = ?`).join(", ");
    const binds = campos.map((c) => cambio[c]);
    await db
      .prepare(`UPDATE ticket_puertos SET ${sets}, actualizado_en = ? WHERE id = ?`)
      .bind(...binds, nowIso(), cambio.id)
      .run();

    for (const c of campos) {
      if (String(actual[c]) === String(cambio[c])) continue;
      await logCambio(db, {
        ticket_id: ticket.id,
        ticket_puerto_id: cambio.id,
        tipo_cambio: "puerto",
        campo: c,
        valor_anterior: actual[c],
        valor_nuevo: cambio[c],
        usuario_email: usuario,
      });
    }
  }

  return json({ ok: true });
}
