import { json, badRequest, currentUserEmail, logCambio, nowIso } from "../../_lib/helpers.js";

// GET /api/tickets?crm=326159&estado=EN+CURSO&oficina_id=3&limit=50
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const url = new URL(request.url);
  const crm = url.searchParams.get("crm");
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

  if (crm) {
    sql += " AND t.ticket_crm LIKE ?";
    binds.push(`%${crm}%`);
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
    ticket_crm,
    tickets_vinculados,
    fecha_apertura_cda,
    fecha_apertura_crm,
    estado_ticket,
    unidad_resolutoria,
    categoria_afectacion,
    afectacion,
    comentario,
    descripcion,
    oficina_id,
    puertos, // [{ olt, tarjeta, puerto, sector, edificio, no_clientes_reportaron, nro_clientes_afectados }]
  } = body;

  if (!ticket_crm || !/^[0-9]+$/.test(String(ticket_crm))) {
    return badRequest("El Ticket CRM-COR es obligatorio y debe contener solo números.");
  }
  if (!Array.isArray(puertos) || puertos.length === 0) {
    return badRequest("Debe incluir al menos un OLT/Tarjeta/Puerto afectado.");
  }

  const existing = await db.prepare("SELECT id FROM tickets WHERE ticket_crm = ?").bind(String(ticket_crm)).first();
  if (existing) {
    return badRequest(`Ya existe un ticket registrado con el número ${ticket_crm}.`);
  }

  const insertTicket = await db
    .prepare(
      `INSERT INTO tickets
        (ticket_crm, tickets_vinculados, fecha_apertura_cda, fecha_apertura_crm, estado_ticket,
         unidad_resolutoria, categoria_afectacion, afectacion, comentario, descripcion, oficina_id, creado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      String(ticket_crm),
      tickets_vinculados || null,
      fecha_apertura_cda || null,
      fecha_apertura_crm || null,
      estado_ticket || "EN CURSO (ASIGNADO)",
      unidad_resolutoria || null,
      categoria_afectacion || null,
      afectacion || null,
      comentario || null,
      descripcion || null,
      oficina_id || null,
      usuario
    )
    .run();

  const ticketId = insertTicket.meta.last_row_id;

  for (const p of puertos) {
    const ins = await db
      .prepare(
        `INSERT INTO ticket_puertos
          (ticket_id, olt, tarjeta, puerto, sector, edificio, no_clientes_reportaron, nro_clientes_afectados, estado_puerto)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ticketId,
        p.olt,
        p.tarjeta,
        p.puerto,
        p.sector || "DESCONOCIDO",
        p.edificio || "DESCONOCIDO",
        Number(p.no_clientes_reportaron || 0),
        Number(p.nro_clientes_afectados || 0),
        p.estado_puerto || "EN CURSO (ASIGNADO)"
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
    valor_nuevo: `Ticket ${ticket_crm} creado con ${puertos.length} puerto(s)`,
    usuario_email: usuario,
  });

  return json({ id: ticketId, ticket_crm: String(ticket_crm), creado_en: nowIso() }, 201);
}
