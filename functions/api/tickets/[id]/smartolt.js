import { json, badRequest, notFound, currentUserEmail, logCambio, nowIso } from "../../../_lib/helpers.js";
import { programarReevaluacion } from "../../../_lib/asociacion.js";
import { normCedula, normSerial } from "../../../_lib/clientes.js";

// POST /api/tickets/:id/smartolt   (Editar Ticket > Cambio de campo > archivos de SmartOLT)
// Body: {
//   agregar:    [{ oficina_id, olt, tarjeta, puerto, sector, edificio, ubicacion, nro_clientes_afectados }]   puertos que NO estaban registrados
//   actualizar: [{ id, nro_clientes_afectados }]                                                              puertos existentes cuyo número el usuario aceptó cambiar
//   onus:       [{ olt, tarjeta, puerto, serial, cuenta, cedula, nombre, estado, direccion }]                 ONUs del análisis (reemplazan las que ya tuviera ese puerto)
//   descripcion_bloque: "— Análisis SmartOLT —\n..."                                                         se agrega al final de la descripción (reemplaza el análisis anterior)
// }
// Los puertos que ya existen NO se tocan, salvo el número de clientes afectados cuando el usuario lo acepta puerto por puerto.
const MAX_AGREGAR = 500, MAX_ONUS = 3000, MARCA = "— Análisis SmartOLT —";
const t = (v, n) => String(v ?? "").trim().slice(0, n) || null;

export async function onRequestPost({ request, env, params, waitUntil }) {
  const db = env.DB;
  const usuario = currentUserEmail(request);
  const body = await request.json().catch(() => ({}));

  const ticket = await db.prepare("SELECT * FROM tickets WHERE id = ? OR ticket_cmr = ?").bind(params.id, params.id).first();
  if (!ticket) return notFound("Ticket no encontrado");
  if (["RESUELTO", "CERRADO"].includes(ticket.estado_ticket)) {
    return badRequest(`El ticket está ${ticket.estado_ticket}: no se le pueden agregar puertos con SmartOLT.`);
  }

  const agregar = Array.isArray(body.agregar) ? body.agregar : [];
  const actualizar = Array.isArray(body.actualizar) ? body.actualizar : [];
  const onus = Array.isArray(body.onus) ? body.onus : [];
  if (agregar.length > MAX_AGREGAR) return badRequest(`Máximo ${MAX_AGREGAR} puertos nuevos por carga.`);
  if (onus.length > MAX_ONUS) return badRequest(`Máximo ${MAX_ONUS} ONUs por carga.`);
  if (!agregar.length && !actualizar.length && !onus.length && !body.descripcion_bloque) return badRequest("No hay nada que guardar.");

  const cant = (v) => (/^\d+$/.test(String(v ?? "").trim()) && Number.isSafeInteger(Number(v)) ? Number(v) : null);
  for (const p of agregar) {
    if (!p || !t(p.olt, 80) || !t(p.tarjeta, 40) || !t(p.puerto, 40) || !/^\d+$/.test(String(p.oficina_id ?? "")) || cant(p.nro_clientes_afectados) === null) {
      return badRequest("Algún puerto nuevo no es válido (OLT, tarjeta, puerto, oficina y clientes afectados son obligatorios).");
    }
  }
  for (const a of actualizar) if (!a || !/^\d+$/.test(String(a.id ?? "")) || cant(a.nro_clientes_afectados) === null) return badRequest("Algún cambio de clientes afectados no es válido.");

  // Los puertos nuevos nacen con el mismo estado que ya tienen los registros del ticket
  const ref = await db.prepare("SELECT estado_puerto FROM ticket_puertos WHERE ticket_id = ? ORDER BY id LIMIT 1").bind(ticket.id).first();
  const estadoPuerto = (ref && ref.estado_puerto) || "EN CURSO (ASIGNADO)";

  // 1) puertos nuevos (si ya existe esa OLT+tarjeta+puerto en el ticket se omite: lo registrado no se toca)
  const existentes = (await db.prepare("SELECT olt, tarjeta, puerto FROM ticket_puertos WHERE ticket_id = ?").bind(ticket.id).all()).results
    .map((r) => `${String(r.olt).toUpperCase()}|${r.tarjeta}|${r.puerto}`);
  const ya = new Set(existentes);
  let agregados = 0, omitidos = 0;
  for (const p of agregar) {
    const k = `${String(p.olt).trim().toUpperCase()}|${String(p.tarjeta).trim()}|${String(p.puerto).trim()}`;
    if (ya.has(k)) { omitidos++; continue; }
    ya.add(k);
    const ins = await db.prepare(
      `INSERT INTO ticket_puertos (ticket_id, oficina_id, olt, tarjeta, puerto, sector, edificio, ubicacion, no_clientes_reportaron, nro_clientes_afectados, estado_puerto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(ticket.id, Number(p.oficina_id), t(p.olt, 80), t(p.tarjeta, 40), t(p.puerto, 40), t(p.sector, 120) || "DESCONOCIDO", t(p.edificio, 120) || "DESCONOCIDO",
        t(p.ubicacion, 200), cant(p.nro_clientes_afectados), estadoPuerto).run();
    agregados++;
    await logCambio(db, { ticket_id: ticket.id, ticket_puerto_id: ins.meta.last_row_id, tipo_cambio: "creacion", campo: "puerto",
      valor_anterior: null, valor_nuevo: `${p.olt} | ${p.tarjeta} | ${p.puerto} (agregado desde SmartOLT, ${cant(p.nro_clientes_afectados)} afectados)`, usuario_email: usuario });
  }

  // 2) clientes afectados aceptados puerto por puerto
  let actualizados = 0;
  for (const a of actualizar) {
    const actual = await db.prepare("SELECT id, nro_clientes_afectados FROM ticket_puertos WHERE id = ? AND ticket_id = ?").bind(a.id, ticket.id).first();
    if (!actual) continue;
    const nuevo = cant(a.nro_clientes_afectados);
    if (Number(actual.nro_clientes_afectados) === nuevo) continue;
    await db.prepare("UPDATE ticket_puertos SET nro_clientes_afectados = ?, actualizado_en = ? WHERE id = ?").bind(nuevo, nowIso(), actual.id).run();
    actualizados++;
    await logCambio(db, { ticket_id: ticket.id, ticket_puerto_id: actual.id, tipo_cambio: "puerto", campo: "nro_clientes_afectados",
      valor_anterior: actual.nro_clientes_afectados, valor_nuevo: nuevo, usuario_email: usuario });
  }

  // 3) ONUs: las de cada puerto del archivo reemplazan a las que ese puerto ya tuviera
  let onusGuardadas = 0;
  if (onus.length) {
    try {
      const llaves = new Map();
      onus.forEach((o) => llaves.set(`${t(o.olt, 80)}|${t(o.tarjeta, 30)}|${t(o.puerto, 30)}`, [t(o.olt, 80), t(o.tarjeta, 30), t(o.puerto, 30)]));
      const ahora = nowIso();
      const stmts = [...llaves.values()].map(([olt, tar, pue]) => db.prepare("DELETE FROM ticket_onus WHERE ticket_id = ? AND olt IS ? AND tarjeta IS ? AND puerto IS ?").bind(ticket.id, olt, tar, pue));
      onus.forEach((o) => stmts.push(db.prepare(
        `INSERT INTO ticket_onus (ticket_id, olt, tarjeta, puerto, serial, cuenta, cedula, nombre, estado, direccion, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(ticket.id, t(o.olt, 80), t(o.tarjeta, 30), t(o.puerto, 30), normSerial(o.serial) || null, t(String(o.cuenta ?? "").replace(/\D/g, ""), 20),
          normCedula(o.cedula), t(o.nombre, 200), t(o.estado, 40), t(o.direccion, 300), ahora)));
      for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
      onusGuardadas = onus.length;
    } catch (e) { onusGuardadas = -1; }
  }

  // 4) descripción: el análisis nuevo reemplaza al anterior al final del texto
  let descripcion = false;
  const bloque = String(body.descripcion_bloque || "").trim();
  if (bloque.startsWith(MARCA)) {
    const base = String(ticket.descripcion || "");
    const i = base.indexOf(MARCA);
    const sin = (i >= 0 ? base.slice(0, i) : base).replace(/\s+$/, "");
    const nueva = ((sin ? sin + "\n\n" : "") + bloque).slice(0, 20000);
    await db.prepare("UPDATE tickets SET descripcion = ?, actualizado_en = ? WHERE id = ?").bind(nueva, nowIso(), ticket.id).run();
    descripcion = true;
    await logCambio(db, { ticket_id: ticket.id, tipo_cambio: "edicion", campo: "descripcion", valor_anterior: "(sin análisis SmartOLT previo)", valor_nuevo: "Análisis SmartOLT agregado", usuario_email: usuario });
  }

  await programarReevaluacion({ env, waitUntil }, [ticket.id]);
  return json({ ok: true, agregados, omitidos, actualizados, onus_guardadas: onusGuardadas, descripcion });
}
