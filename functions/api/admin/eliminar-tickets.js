import { json, badRequest, requireAdmin, nowIso } from "../../_lib/helpers.js";
import { verificarPassword } from "../../_lib/auth.js";

// POST /api/admin/eliminar-tickets
// Body: { tickets: ["334455", ...], password: "<clave del administrador que confirma>" }
// Solo administradores. Exige la contraseña de quien está conectado (confirmación),
// borra cada ticket con TODOS sus registros de detalle y su historial (log), y deja
// una huella en la tabla tickets_eliminados (quién, cuándo, qué ticket).
export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  const db = env.DB;
  const body = await request.json().catch(() => ({}));

  const lista = Array.isArray(body.tickets) ? [...new Set(body.tickets.map((t) => String(t).trim()))] : [];
  if (lista.length === 0) return badRequest("Selecciona al menos un ticket.");
  if (lista.length > 500) return badRequest("Máximo 500 tickets por operación.");
  if (lista.some((t) => !/^[0-9]+$/.test(t))) return badRequest("Número de ticket inválido.");

  const password = String(body.password || "");
  if (!password) return badRequest("Ingresa tu contraseña para confirmar.");
  const fila = await db.prepare("SELECT password_cifrada FROM usuarios WHERE email = ?").bind(admin.email).first();
  const claveOk = !!fila && (await verificarPassword(password, fila.password_cifrada, env));
  if (!claveOk) return json({ error: "Contraseña incorrecta. No se eliminó nada." }, 403);

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS tickets_eliminados (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       ticket_cmr TEXT NOT NULL, categoria_afectacion TEXT, estado_ticket TEXT,
       num_registros INTEGER NOT NULL DEFAULT 0,
       eliminado_por TEXT NOT NULL, eliminado_en TEXT NOT NULL)`
  ).run();

  let ticketsEliminados = 0;
  let registrosEliminados = 0;
  const CHUNK = 40;                       // D1 admite pocos parámetros por consulta
  for (let i = 0; i < lista.length; i += CHUNK) {
    const grupo = lista.slice(i, i + CHUNK);
    const marcas = grupo.map(() => "?").join(",");
    const { results: tickets } = await db.prepare(
      `SELECT t.id, t.ticket_cmr, t.categoria_afectacion, t.estado_ticket,
              (SELECT COUNT(*) FROM ticket_puertos p WHERE p.ticket_id = t.id) AS n
       FROM tickets t WHERE t.ticket_cmr IN (${marcas})`
    ).bind(...grupo).all();
    if (tickets.length === 0) continue;

    const ids = tickets.map((t) => t.id);
    const idMarcas = ids.map(() => "?").join(",");
    const ahora = nowIso();
    const pasos = tickets.map((t) =>
      db.prepare(
        `INSERT INTO tickets_eliminados (ticket_cmr, categoria_afectacion, estado_ticket, num_registros, eliminado_por, eliminado_en)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(t.ticket_cmr, t.categoria_afectacion, t.estado_ticket, t.n, admin.email, ahora)
    );
    pasos.push(db.prepare(`DELETE FROM ticket_log WHERE ticket_id IN (${idMarcas})`).bind(...ids));
    pasos.push(db.prepare(`DELETE FROM ticket_puertos WHERE ticket_id IN (${idMarcas})`).bind(...ids));
    pasos.push(db.prepare(`DELETE FROM tickets WHERE id IN (${idMarcas})`).bind(...ids));
    await db.batch(pasos);                // todo o nada para este grupo

    ticketsEliminados += tickets.length;
    registrosEliminados += tickets.reduce((s, t) => s + (t.n || 0), 0);
  }

  return json({
    ok: true,
    solicitados: lista.length,
    tickets_eliminados: ticketsEliminados,
    registros_eliminados: registrosEliminados,
    no_encontrados: lista.length - ticketsEliminados,
  });
}
