import { json, badRequest, currentUserEmail, logCambio, nowIso } from "../../_lib/helpers.js";
import { verificarTokenDuplicado } from "../../_lib/auth.js";

// GET /api/tickets?cmr=326159&estado=EN+CURSO&oficina_id=3&limit=50
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const cmr = url.searchParams.get("cmr");
  const estado = url.searchParams.get("estado");
  const oficinaId = url.searchParams.get("oficina_id");
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  let sql = `
    SELECT t.*, o.nombre AS oficina_nombre,
      (SELECT COUNT(*) FROM ticket_puertos p WHERE p.ticket_id = t.id) AS total_puertos
    FROM tickets t
    LEFT JOIN oficinas o ON o.id = t.oficina_id
    WHERE 1 = 1
  `;
  const binds = [];

  if (cmr) {
    sql += " AND t.ticket_cmr LIKE ?";
    binds.push(`%${cmr}%`);
  }
  if (estado) {
    sql += " AND t.estado_ticket = ?";
    binds.push(estado);
  }
  if (oficinaId) {
    sql += " AND t.oficina_id = ?";
    binds.push(oficinaId);
  }

  sql += " ORDER BY t.creado_en DESC LIMIT ?";
  binds.push(limit);

  const stmt = db.prepare(sql).bind(...binds);
  const { results } = await stmt.all();
  return json({ tickets: results });
}

// POST /api/tickets
// Crea el ticket junto con todos sus OLT/Tarjeta/Puerto en una sola operación.
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const body = await request.json();
  const usuario = currentUserEmail(request);

  const {
    ticket_cmr,
    tickets_vinculados,
    fecha_apertura_cda,
    fecha_falla,
    fecha_apertura_cmr,
    fecha_solucion_cmr,
    fecha_cierre_cmr,
    fecha_solucion_cda,
    fecha_cierre_cda,
    estado_ticket,
    unidad_resolutoria,
    categoria_afectacion,
    afectacion,
    comentario,
    descripcion,
    oficina_id,
    puertos, // [{ olt, tarjeta, puerto, sector, edificio, no_clientes_reportaron, nro_clientes_afectados }]
  } = body;

  if (!ticket_cmr || !/^[0-9]+$/.test(String(ticket_cmr))) {
    return badRequest("El Ticket CMR-COR es obligatorio y debe contener solo números.");
  }
  if (!Array.isArray(puertos) || puertos.length === 0) {
    return badRequest("Debe incluir al menos un OLT/Tarjeta/Puerto afectado.");
  }

  const existing = await db.prepare("SELECT id FROM tickets WHERE ticket_cmr = ?").bind(String(ticket_cmr)).first();
  // Ticket repetido: solo se permite con el permiso de 2 minutos (contraseña re-escrita); en ese caso los registros
  // (OLT/Tarjeta/Puerto) se AGREGAN al ticket existente y sus datos generales no se tocan.
  const agregando = !!existing;
  if (existing && !(await verificarTokenDuplicado(body.token_duplicado, usuario, ticket_cmr, env))) {
    return badRequest(`Ya existe un ticket registrado con el número ${ticket_cmr}.`);
  }

  // Ticket NUEVO: las tres fechas son obligatorias (los registros que se agregan a un ticket existente no tocan sus datos generales).
  if (!agregando) {
    const OBLIG = { fecha_apertura_cmr: "Fecha de Apertura del CMR", fecha_apertura_cda: "Fecha de Apertura del CDA", fecha_falla: "Fecha de la Falla" };
    const FECHA_OBL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
    for (const [campo, nombre] of Object.entries(OBLIG)) {
      const v = String(body[campo] || "").trim();
      if (!v) return badRequest(`La ${nombre} es obligatoria.`);
      if (!FECHA_OBL.test(v)) return badRequest(`La ${nombre} no tiene un formato válido.`);
    }
  }

  // El ticket puede abarcar varias oficinas (una por cada OLT registrado).
  // El campo tickets.oficina_id guarda la primera como oficina "principal"
  // para efectos de listado/filtro; la oficina real de cada OLT queda en
  // ticket_puertos.oficina_id.
  // Estado al crear: RESUELTO admite fechas de solución; CERRADO admite también las de cierre. En otros estados se ignoran.
  const estadoFinal = estado_ticket || "EN CURSO (ASIGNADO)";
  const esResuelto = estadoFinal === "RESUELTO" || estadoFinal === "CERRADO";
  const esCerrado = estadoFinal === "CERRADO";
  const limpia = (v) => String(v || "").trim() || null;
  const sCmr = esResuelto ? limpia(fecha_solucion_cmr) : null;
  const cCmr = esCerrado ? limpia(fecha_cierre_cmr) : null;
  const cCda = esCerrado ? limpia(fecha_cierre_cda) : null;
  let sCda = esResuelto ? limpia(fecha_solucion_cda) : null;
  if (!sCda && cCda) sCda = cCda;   // sin fecha de solución del CDA pero con cierre del CDA: la solución toma la fecha del cierre
  const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
  if ([sCmr, cCmr, sCda, cCda].some((v) => v && !FECHA.test(v))) return badRequest("Alguna fecha de solución o cierre no tiene un formato válido.");

  const oficinaPrincipal = oficina_id || (puertos.find((p) => p.oficina_id) || {}).oficina_id || null;

  const insertTicket = agregando ? null : await db
    .prepare(
      `INSERT INTO tickets
        (ticket_cmr, tickets_vinculados, fecha_apertura_cda, fecha_apertura_cmr, fecha_falla, estado_ticket, fecha_solucion_cmr, fecha_solucion_cda,
         unidad_resolutoria, categoria_afectacion, afectacion, comentario, descripcion, oficina_id, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      String(ticket_cmr),
      tickets_vinculados || null,
      fecha_apertura_cda || null,
      fecha_apertura_cmr || null,
      fecha_falla || null,
      estadoFinal,
      sCmr,
      sCda,
      unidad_resolutoria || null,
      categoria_afectacion || null,
      afectacion || null,
      comentario || null,
      descripcion || null,
      oficinaPrincipal,
      usuario
    )
    .run();

  const ticketId = agregando ? existing.id : insertTicket.meta.last_row_id;

  // Integridad: oficinas especiales sin ubicación física => todo "N/A" (aunque el cliente envíe otra cosa)
  const NOMBRES_NA = ["SOPORTE TÉCNICO PERO NO APLICA", "CENTRAL TELEFÓNICA", "HERRAMIENTAS VNET", "MERCADEO", "PAGOS"];
  const { results: ofNA } = await db
    .prepare(`SELECT id FROM oficinas WHERE nombre IN (${NOMBRES_NA.map(() => "?").join(",")})`)
    .bind(...NOMBRES_NA)
    .all();
  const idsNA = new Set((ofNA || []).map((o) => Number(o.id)));
  for (const p of puertos) {
    if (p.oficina_id && idsNA.has(Number(p.oficina_id))) {
      p.olt = p.tarjeta = p.puerto = p.sector = p.edificio = "N/A";
    }
  }

  for (const p of puertos) {
    const ins = await db
      .prepare(
        `INSERT INTO ticket_puertos
          (ticket_id, oficina_id, olt, tarjeta, puerto, sector, edificio, no_clientes_reportaron, nro_clientes_afectados, estado_puerto,
           fecha_solucion_cmr, fecha_solucion_cda, fecha_cierre_cmr, fecha_cierre_cda)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ticketId,
        p.oficina_id || null,
        p.olt,
        p.tarjeta,
        p.puerto,
        p.sector || "DESCONOCIDO",
        p.edificio || "DESCONOCIDO",
        Number(p.no_clientes_reportaron || 0),
        Number(p.nro_clientes_afectados || 0),
        esResuelto ? estadoFinal : (p.estado_puerto || "EN CURSO (ASIGNADO)"),
        sCmr,
        sCda,
        cCmr,
        cCda
      )
      .run();

    await logCambio(db, {
      ticket_id: ticketId,
      ticket_puerto_id: ins.meta.last_row_id,
      tipo_cambio: "creacion",
      campo: "puerto",
      valor_anterior: null,
      valor_nuevo: `${p.olt} | ${p.tarjeta} | ${p.puerto}`,
      usuario_email: usuario,
    });
  }

  await logCambio(db, {
    ticket_id: ticketId,
    tipo_cambio: "creacion",
    campo: "ticket",
    valor_anterior: null,
    valor_nuevo: agregando
      ? `Ticket ${ticket_cmr} ya existía: se agregaron ${puertos.length} registro(s) con confirmación de contraseña`
      : `Ticket ${ticket_cmr} creado con ${puertos.length} puerto(s)`,
    usuario_email: usuario,
  });

  return json({ id: ticketId, ticket_cmr: String(ticket_cmr), creado_en: nowIso(), agregado: agregando }, 201);
}
