import { json, badRequest, nowIso } from "../../_lib/helpers.js";
import { reabrirAlertasHuerfanas } from "../../_lib/asociacion.js";
import { confirmarAdminConClave } from "../../_lib/confirmar.js";

// POST /api/admin/eliminar-registros   (RUTA 2: registro ÚNICO / registros sueltos)
// Body: { registros: [id de ticket_puertos, ...], password: "<clave del administrador>" }
// Borra solo esas filas de detalle; el ticket y sus demás registros se conservan.
// Cada borrado queda en el log del ticket y en la tabla registros_eliminados (auditoría).
// Si con esto el ticket se queda SIN registros, se elimina también (un ticket vacío no se
// vería en ninguna pantalla) y queda anotado en tickets_eliminados.
export async function onRequestPost({ request, env, waitUntil }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));

  const ids = Array.isArray(body.registros) ? [...new Set(body.registros.map((x) => String(x).trim()))] : [];
  if (ids.length === 0) return badRequest("Selecciona al menos un registro.");
  if (ids.length > 500) return badRequest("Máximo 500 registros por operación.");
  if (ids.some((x) => !/^[0-9]+$/.test(x))) return badRequest("Identificador de registro inválido.");

  const { admin, error } = await confirmarAdminConClave(request, env, body.password);
  if (error) return error;

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS registros_eliminados (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       ticket_cmr TEXT NOT NULL, registro_id INTEGER, oficina TEXT,
       olt TEXT, tarjeta TEXT, puerto TEXT, sector TEXT, edificio TEXT,
       nro_clientes_afectados INTEGER, no_clientes_reportaron INTEGER, estado_puerto TEXT,
       eliminado_por TEXT NOT NULL, eliminado_en TEXT NOT NULL)`
  ).run();
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS tickets_eliminados (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       ticket_cmr TEXT NOT NULL, categoria_afectacion TEXT, estado_ticket TEXT,
       num_registros INTEGER NOT NULL DEFAULT 0,
       eliminado_por TEXT NOT NULL, eliminado_en TEXT NOT NULL)`
  ).run();

  let registrosEliminados = 0;
  const ticketsAfectados = new Set();
  const CHUNK = 40;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const grupo = ids.slice(i, i + CHUNK);
    const marcas = grupo.map(() => "?").join(",");
    const { results: filas } = await db.prepare(
      `SELECT p.id, p.ticket_id, t.ticket_cmr, o.nombre AS oficina, p.olt, p.tarjeta, p.puerto, p.sector, p.edificio,
              p.nro_clientes_afectados, p.no_clientes_reportaron, p.estado_puerto
       FROM ticket_puertos p
       JOIN tickets t ON t.id = p.ticket_id
       LEFT JOIN oficinas o ON o.id = p.oficina_id
       WHERE p.id IN (${marcas})`
    ).bind(...grupo).all();
    if (filas.length === 0) continue;

    const ahora = nowIso();
    const pasos = [];
    for (const f of filas) {
      const etiqueta = [f.olt, f.tarjeta, f.puerto].join(" / ");
      pasos.push(db.prepare(
        `INSERT INTO registros_eliminados (ticket_cmr, registro_id, oficina, olt, tarjeta, puerto, sector, edificio,
           nro_clientes_afectados, no_clientes_reportaron, estado_puerto, eliminado_por, eliminado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(f.ticket_cmr, f.id, f.oficina, f.olt, f.tarjeta, f.puerto, f.sector, f.edificio,
             f.nro_clientes_afectados, f.no_clientes_reportaron, f.estado_puerto, admin.email, ahora));
      pasos.push(db.prepare(
        `INSERT INTO ticket_log (ticket_id, ticket_puerto_id, tipo_cambio, campo, valor_anterior, valor_nuevo, usuario_email)
         VALUES (?, NULL, 'eliminacion', 'registro', ?, NULL, ?)`
      ).bind(f.ticket_id, `${f.oficina || "-"} | ${etiqueta}`, admin.email));
      ticketsAfectados.add(f.ticket_id);
    }
    const idsReales = filas.map((f) => f.id);
    pasos.push(db.prepare(`DELETE FROM ticket_puertos WHERE id IN (${idsReales.map(() => "?").join(",")})`).bind(...idsReales));
    await db.batch(pasos);                 // todo o nada para este grupo
    registrosEliminados += filas.length;
  }

  // Tickets que se quedaron sin ningún registro: se eliminan también.
  let ticketsVaciadosEliminados = 0;
  const afectados = [...ticketsAfectados];
  for (let i = 0; i < afectados.length; i += CHUNK) {
    const grupo = afectados.slice(i, i + CHUNK);
    const marcas = grupo.map(() => "?").join(",");
    const { results: vacios } = await db.prepare(
      `SELECT t.id, t.ticket_cmr, t.categoria_afectacion, t.estado_ticket FROM tickets t
       WHERE t.id IN (${marcas}) AND NOT EXISTS (SELECT 1 FROM ticket_puertos p WHERE p.ticket_id = t.id)`
    ).bind(...grupo).all();
    if (vacios.length === 0) continue;
    const idsV = vacios.map((v) => v.id);
    const mV = idsV.map(() => "?").join(",");
    const ahora = nowIso();
    const pasos = vacios.map((v) => db.prepare(
      `INSERT INTO tickets_eliminados (ticket_cmr, categoria_afectacion, estado_ticket, num_registros, eliminado_por, eliminado_en)
       VALUES (?, ?, ?, 0, ?, ?)`
    ).bind(v.ticket_cmr, v.categoria_afectacion, v.estado_ticket, admin.email, ahora));
    pasos.push(db.prepare(`DELETE FROM ticket_log WHERE ticket_id IN (${mV})`).bind(...idsV));
    pasos.push(db.prepare(`DELETE FROM tickets WHERE id IN (${mV})`).bind(...idsV));
    await db.batch(pasos);
    ticketsVaciadosEliminados += vacios.length;
  }

  try { await reabrirAlertasHuerfanas(env.DB); } catch (e) { /* módulo no instalado */ }
  return json({
    ok: true,
    solicitados: ids.length,
    registros_eliminados: registrosEliminados,
    no_encontrados: ids.length - registrosEliminados,
    tickets_vaciados_eliminados: ticketsVaciadosEliminados,
  });
}
