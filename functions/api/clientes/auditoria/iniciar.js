import { json, badRequest, requireRole, currentUserEmail } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES, FECHA_BASE_OK } from "../../../_lib/clientes.js";
import { horasEntre, leerParametro } from "../../../_lib/cruce.js";

// POST /api/clientes/auditoria/iniciar
// Body: { archivo, olt_id_smartolt, olt_nombre, tarjeta, puerto, estado_filtro, fecha_auditoria_utc, fecha_auditoria_local, total_onus }
// Devuelve el estado de cada base vigente frente a la hora de la auditoría (tolerancia configurable, 12 h por defecto).
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const olt = String(b.olt_nombre || "").trim().toUpperCase();
  if (!olt) return badRequest("No se pudo determinar la OLT de la auditoría.");
  if (!FECHA_BASE_OK.test(String(b.fecha_auditoria_local || ""))) return badRequest("La fecha y hora de la auditoría no es válida.");
  const total = Number(b.total_onus);
  if (!Number.isInteger(total) || total < 1) return badRequest("El archivo no trae ONUs.");
  const entero = (v) => (v === null || v === undefined || v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : null);

  // Auditorías que quedaron a medias hace más de un día (se cerró el navegador): se limpian.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auditoria_onus WHERE auditoria_id IN (SELECT id FROM auditorias WHERE total_onus = 0 AND fecha_subida < datetime('now','-1 day'))"),
    env.DB.prepare("DELETE FROM auditorias WHERE total_onus = 0 AND fecha_subida < datetime('now','-1 day')"),
  ]);
  const bases = (await env.DB.prepare("SELECT id, sucursal, fecha_base FROM cargas_base WHERE estado = 'vigente' ORDER BY sucursal").all()).results;
  if (!bases.length) return badRequest("Todavía no hay ninguna base de clientes cargada (Paso 2). Sube primero la base de Grafana.");
  const tol = await leerParametro(env.DB, "tolerancia_base_horas", 12);
  const estadoBases = bases.map((g) => {
    const h = horasEntre(b.fecha_auditoria_local, g.fecha_base);
    return { carga_id: g.id, sucursal: g.sucursal, fecha_base: g.fecha_base, horas: Math.round(h * 10) / 10, desactualizada: h > tol };
  });

  const r = await env.DB.prepare(
    `INSERT INTO auditorias (archivo, olt_id_smartolt, olt_nombre, tarjeta, puerto, estado_filtro, fecha_auditoria_utc, fecha_auditoria_local, usuario, total_onus)
     VALUES (?,?,?,?,?,?,?,?,?,0)`)
    .bind(String(b.archivo || "").slice(0, 250) || null, b.olt_id_smartolt ? String(b.olt_id_smartolt).slice(0, 20) : null, olt,
      entero(b.tarjeta), entero(b.puerto), b.estado_filtro ? String(b.estado_filtro).slice(0, 30) : null,
      FECHA_BASE_OK.test(String(b.fecha_auditoria_utc || "")) ? b.fecha_auditoria_utc : null, b.fecha_auditoria_local, currentUserEmail(request)).run();
  return json({ auditoria_id: r.meta.last_row_id, tolerancia_horas: tol, bases: estadoBases }, 201);
}
