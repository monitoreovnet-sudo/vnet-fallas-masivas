import { json, badRequest, requireAdmin } from "../../_lib/helpers.js";
import { usuarioDeSesion } from "../../_lib/auth.js";

// GET /api/ventanas
//   Sin sesión (Pizarra pública): solo { total, actualizado }.
//   Con sesión: además la lista de ventanas y datos del archivo.
// POST /api/ventanas  (solo administrador)
//   Body: { nombre_archivo, titulo, total_hojas, archivo_b64, filas:[...] }  (ya leído en el navegador).
//   Reemplaza TODAS las ventanas anteriores por las del archivo nuevo.

const MAX_B64 = 1_400_000;      // ~1 MB de archivo
const MAX_FILAS = 500;
const COLS = ["descripcion", "resumen", "fecha_inicio", "fecha_fin", "impacto", "afecta_servicio", "tipo_afectacion",
  "tiempo_afectacion", "servicios_afectados", "localidad", "unidad_solicitante", "responsable", "aprobacion", "observaciones"];

const txt = (v, n = 2000) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().slice(0, n));
const fechaOk = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v) ? v : null);

// Hora de Caracas (UTC-4, sin horario de verano) como "AAAA-MM-DDTHH:MM"
function ahoraCaracas() {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 16);
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const carga = await db.prepare("SELECT id, subido_en, subido_por, nombre_archivo, titulo, total_hojas FROM ventanas_carga ORDER BY id DESC LIMIT 1").first();
  if (!carga) return json({ total: 0, actualizado: null, filas: [] });
  const t = await db.prepare("SELECT COUNT(DISTINCT ticket) AS n FROM ventanas WHERE carga_id = ?").bind(carga.id).first();
  const base = { total: t ? t.n : 0, actualizado: carga.subido_en };
  const sesion = await usuarioDeSesion(request, env);
  if (!sesion) return json(base);
  const { results } = await db.prepare(
    `SELECT ticket, ${COLS.join(", ")} FROM ventanas WHERE carga_id = ? ORDER BY fecha_inicio, orden`).bind(carga.id).all();
  return json({ ...base, nombre_archivo: carga.nombre_archivo, titulo: carga.titulo, total_hojas: carga.total_hojas, subido_por: carga.subido_por, filas: results });
}

export async function onRequestPost({ request, env }) {
  const usuario = await requireAdmin(request, env);
  const body = await request.json();
  const db = env.DB;
  const filas = Array.isArray(body.filas) ? body.filas : [];
  if (filas.length === 0) return badRequest("El archivo no tiene ventanas de mantenimiento para cargar.");
  if (filas.length > MAX_FILAS) return badRequest(`El archivo tiene demasiadas filas (máximo ${MAX_FILAS}).`);
  const b64 = typeof body.archivo_b64 === "string" ? body.archivo_b64 : "";
  if (b64.length > MAX_B64) return badRequest("El archivo pesa demasiado (máximo 1 MB).");

  const limpias = [];
  for (const f of filas) {
    const ticket = String((f && f.ticket) ?? "").replace(/\D/g, "").slice(0, 20);
    if (!ticket) continue;
    const o = { ticket };
    COLS.forEach((c) => { o[c] = c.startsWith("fecha_") ? fechaOk(f[c]) : txt(f[c]); });
    limpias.push(o);
  }
  if (limpias.length === 0) return badRequest("Ninguna fila tiene un 'ID del Cambio' válido.");

  const ahora = ahoraCaracas();
  const ins = await db.prepare(
    "INSERT INTO ventanas_carga (subido_en, subido_por, nombre_archivo, titulo, total_hojas, archivo_b64) VALUES (?,?,?,?,?,?)")
    .bind(ahora, usuario.email, txt(body.nombre_archivo, 200), txt(body.titulo, 300), Math.max(1, Number(body.total_hojas) || 1), b64 || null).run();
  const cargaId = ins.meta.last_row_id;
  const stmts = limpias.map((o, i) => db.prepare(
    `INSERT INTO ventanas (carga_id, orden, ticket, ${COLS.join(", ")}) VALUES (?,?,?,${COLS.map(() => "?").join(",")})`)
    .bind(cargaId, i, o.ticket, ...COLS.map((c) => o[c])));
  stmts.push(db.prepare("DELETE FROM ventanas WHERE carga_id <> ?").bind(cargaId));
  stmts.push(db.prepare("DELETE FROM ventanas_carga WHERE id <> ?").bind(cargaId));
  await db.batch(stmts);

  const tickets = new Set(limpias.map((o) => o.ticket)).size;
  return json({ ok: true, filas: limpias.length, tickets, actualizado: ahora });
}
