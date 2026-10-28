// Paso 4 del módulo de clientes afectados: asociación auditoría ↔ ticket, caídas previas y alertas de "falla no reportada".
//
// Unidad de trabajo = una auditoría. Para cada PUERTO FÍSICO (OLT + tarjeta + puerto) que aparece en sus ONUs se buscan los tickets que lo cubren:
//   - la OLT coincide (con las equivalencias de prefijo: CRC = CRP, etc.)
//   - registro del ticket con OLT + tarjeta + puerto -> solo ese puerto; con OLT + tarjeta (sin puerto) -> toda la tarjeta; solo OLT -> toda la OLT
//   - fecha de la auditoría >= Apertura CMR y <= Solución (o el ticket sigue sin solucionar)
// Si dos tickets cubren el mismo puerto se asigna el de Apertura CDA más reciente y se marca "revisar duplicado".
// Cada fila de ticket_auditoria es (ticket, auditoría, puerto físico); vigente = la auditoría más reciente de ese ticket para ese puerto.
import { leerParametro } from "./cruce.js";

const EQUIV_FIJAS = { CRC: "CRP", ESB: "ESM", SPS: "SCP", STS: "STB" };
const OLT_VALIDA = /^[A-Z0-9]{2,8}-OL-[A-Z0-9-]+$/;
const pad = (f) => { const s = String(f || "").trim(); return !s ? null : /T\d{2}:\d{2}$/.test(s) ? s + ":00" : s.slice(0, 19); };
export const numDe = (t) => { const m = /(\d+)/.exec(String(t ?? "")); return m ? Number(m[1]) : null; };
const restarHoras = (iso, h) => new Date(Date.parse(iso + "Z") - h * 3600000).toISOString().slice(0, 19);

export async function mapaEquivalencias(db) {
  const m = { ...EQUIV_FIJAS };
  try { (await db.prepare("SELECT prefijo_alterno a, prefijo_canonico c FROM olt_equivalencias").all()).results.forEach((r) => { m[String(r.a).toUpperCase()] = String(r.c).toUpperCase(); }); } catch (e) { /* tabla aún no creada */ }
  return m;
}
export const canon = (olt, eq) => {
  const s = String(olt || "").trim().toUpperCase();
  if (!OLT_VALIDA.test(s)) return null;
  const [pre, ...resto] = s.split("-");
  return [eq[pre] || pre, ...resto].join("-");
};
export const variantes = (canonOlt, eq) => {
  const [pre, ...resto] = canonOlt.split("-");
  const pres = [pre, ...Object.entries(eq).filter(([, c]) => c === pre).map(([a]) => a)];
  return pres.map((p) => [p, ...resto].join("-"));
};

// Fin de la vigencia de un registro: la solución del registro o del ticket (CMR primero, CDA como respaldo); si hay cierre, el cierre. null = sigue abierto.
function finRegistro(r) {
  return pad(r.p_sol_cmr || r.p_sol_cda || r.p_cierre_cmr || r.p_cierre_cda || r.t_sol_cmr || r.t_sol_cda);
}

const SQL_REGISTROS = (n) => `
  SELECT p.id AS reg_id, p.olt, p.tarjeta, p.puerto, p.fecha_solucion_cmr AS p_sol_cmr, p.fecha_solucion_cda AS p_sol_cda,
         p.fecha_cierre_cmr AS p_cierre_cmr, p.fecha_cierre_cda AS p_cierre_cda,
         t.id AS ticket_id, t.ticket_cmr, t.fecha_apertura_cmr, t.fecha_apertura_cda, t.fecha_falla,
         t.fecha_solucion_cmr AS t_sol_cmr, t.fecha_solucion_cda AS t_sol_cda, t.estado_ticket
    FROM ticket_puertos p JOIN tickets t ON t.id = p.ticket_id
   WHERE p.olt IN (${Array(n).fill("?").join(",")}) AND t.fecha_apertura_cmr IS NOT NULL`;

// Re-evalúa UNA auditoría completa. Devuelve un resumen (tickets asociados, caídas previas, alertas).
export async function reevaluarAuditoria(db, audId) {
  const aud = await db.prepare("SELECT * FROM auditorias WHERE id = ?").bind(audId).first();
  if (!aud) return null;
  const eq = await mapaEquivalencias(db);
  const margen = await leerParametro(db, "margen_caida_previa_horas", 1);
  const umbral = await leerParametro(db, "umbral_alerta_onus", 1);
  const fa = pad(aud.fecha_auditoria_local);

  const previos = (await db.prepare("SELECT DISTINCT ticket_id FROM ticket_auditoria WHERE auditoria_id = ?").bind(audId).all()).results.map((r) => r.ticket_id);
  await db.batch([
    db.prepare("UPDATE auditoria_onus SET clasificacion = 'falla' WHERE auditoria_id = ? AND clasificacion = 'caida_previa'").bind(audId),
    db.prepare("DELETE FROM ticket_auditoria WHERE auditoria_id = ?").bind(audId),
  ]);

  // Puertos físicos de la auditoría
  const puertos = (await db.prepare(
    `SELECT olt_nombre, tarjeta, puerto, SUM(clasificacion = 'falla') falla, SUM(clasificacion = 'powerfail') powerfail, COUNT(*) total
       FROM auditoria_onus WHERE auditoria_id = ? AND tarjeta IS NOT NULL AND puerto IS NOT NULL GROUP BY olt_nombre, tarjeta, puerto`).bind(audId).all()).results
    .map((p) => ({ ...p, canon: canon(p.olt_nombre, eq) })).filter((p) => p.canon);

  // Registros de tickets en esas OLT
  const olts = [...new Set(puertos.flatMap((p) => variantes(p.canon, eq)))];
  let regs = [];
  for (let i = 0; i < olts.length; i += 80) {
    const parte = olts.slice(i, i + 80);
    regs = regs.concat((await db.prepare(SQL_REGISTROS(parte.length)).bind(...parte).all()).results);
  }
  regs = regs.map((r) => ({ ...r, canon: canon(r.olt, eq), tar: numDe(r.tarjeta), pue: numDe(r.puerto), ini: pad(r.fecha_apertura_cmr), fin: finRegistro(r) }))
    .filter((r) => r.canon && r.ini <= fa && (!r.fin || fa <= r.fin));

  const stmts = [], tocados = new Set(previos), asociados = new Map();
  const alertas = [];
  for (const p of puertos) {
    const cand = regs.filter((r) => r.canon === p.canon && (r.tar === null || r.tar === p.tarjeta) && (r.tar === null || r.pue === null || r.pue === p.puerto));
    const porTicket = new Map();
    cand.forEach((r) => porTicket.set(r.ticket_id, r));
    if (!porTicket.size) { alertas.push(p); continue; }
    const lista = [...porTicket.values()];
    lista.sort((a, b) => String(pad(b.fecha_apertura_cda) || b.ini).localeCompare(String(pad(a.fecha_apertura_cda) || a.ini)));
    const ganador = lista[0], dup = lista.length > 1 ? 1 : 0;
    tocados.add(ganador.ticket_id);
    stmts.push(db.prepare("INSERT INTO ticket_auditoria (ticket_id, auditoria_id, olt, tarjeta, puerto, vigente, revisar_duplicado) VALUES (?,?,?,?,?,0,?)")
      .bind(ganador.ticket_id, audId, p.olt_nombre, p.tarjeta, p.puerto, dup));
    // Caída previa: la ONU ya estaba caída antes de la falla (Fecha de la falla, o Apertura CMR − margen)
    const ref = pad(ganador.fecha_falla) || restarHoras(ganador.ini, margen);
    stmts.push(db.prepare(
      `UPDATE auditoria_onus SET clasificacion = 'caida_previa'
        WHERE auditoria_id = ? AND olt_nombre = ? AND tarjeta = ? AND puerto = ? AND clasificacion = 'falla'
          AND last_status_change IS NOT NULL AND last_status_change < ?`).bind(audId, p.olt_nombre, p.tarjeta, p.puerto, ref));
    asociados.set(`${p.olt_nombre}|${p.tarjeta}|${p.puerto}`, ganador);
  }
  if (stmts.length) await db.batch(stmts);

  // Vigente: la auditoría más reciente de cada ticket para cada puerto
  const ids = [...tocados];
  for (let i = 0; i < ids.length; i += 80) {
    const parte = ids.slice(i, i + 80);
    await db.prepare(
      `UPDATE ticket_auditoria SET vigente = CASE WHEN auditoria_id = (
           SELECT x.auditoria_id FROM ticket_auditoria x JOIN auditorias a ON a.id = x.auditoria_id
            WHERE x.ticket_id = ticket_auditoria.ticket_id AND x.olt = ticket_auditoria.olt AND x.tarjeta = ticket_auditoria.tarjeta AND x.puerto = ticket_auditoria.puerto
            ORDER BY a.fecha_auditoria_local DESC, a.id DESC LIMIT 1) THEN 1 ELSE 0 END
        WHERE ticket_id IN (${parte.map(() => "?").join(",")})`).bind(...parte).run();
  }

  // Alertas de "Posible falla no reportada": ONUs afectadas (no caída previa, no Power fail) en un puerto sin ticket
  const existentes = (await db.prepare("SELECT id, olt, tarjeta, puerto, estado FROM alertas_no_reportadas WHERE auditoria_id = ?").bind(audId).all()).results;
  const clave = (o, t, p) => `${o}|${t}|${p}`;
  const porClave = new Map(existentes.map((a) => [clave(a.olt, a.tarjeta, a.puerto), a]));
  const vigentes = new Set();
  const ops = [];
  for (const p of alertas) {
    if (p.falla < umbral) continue;
    const k = clave(p.olt_nombre, p.tarjeta, p.puerto); vigentes.add(k);
    const ex = porClave.get(k);
    if (!ex) ops.push(db.prepare("INSERT INTO alertas_no_reportadas (auditoria_id, olt, tarjeta, puerto, n_onus, estado) VALUES (?,?,?,?,?,'abierta')").bind(audId, p.olt_nombre, p.tarjeta, p.puerto, p.falla));
    else if (ex.estado === "descartada") ops.push(db.prepare("UPDATE alertas_no_reportadas SET n_onus = ? WHERE id = ?").bind(p.falla, ex.id));
    else ops.push(db.prepare("UPDATE alertas_no_reportadas SET n_onus = ?, estado = 'abierta', ticket_id = NULL, resuelto_por = NULL WHERE id = ?").bind(p.falla, ex.id));
  }
  for (const a of existentes) {
    const k = clave(a.olt, a.tarjeta, a.puerto);
    if (vigentes.has(k)) continue;
    const g = asociados.get(k);
    if (g && a.estado !== "descartada") ops.push(db.prepare("UPDATE alertas_no_reportadas SET estado = 'cubierta', ticket_id = ? WHERE id = ?").bind(g.ticket_id, a.id));
    else if (!g && a.estado === "cubierta") ops.push(db.prepare("DELETE FROM alertas_no_reportadas WHERE id = ?").bind(a.id));
    else if (!g && a.estado === "abierta") ops.push(db.prepare("DELETE FROM alertas_no_reportadas WHERE id = ?").bind(a.id));
  }
  if (ops.length) await db.batch(ops);
  return resumenAsociacion(db, audId);
}

export async function resumenAsociacion(db, audId) {
  const tickets = (await db.prepare(
    `SELECT t.id ticket_id, t.ticket_cmr, COUNT(DISTINCT ta.olt || '|' || ta.tarjeta || '|' || ta.puerto) puertos, MAX(ta.revisar_duplicado) duplicado
       FROM ticket_auditoria ta JOIN tickets t ON t.id = ta.ticket_id WHERE ta.auditoria_id = ? GROUP BY t.id ORDER BY t.ticket_cmr`).bind(audId).all()).results;
  for (const t of tickets) {
    const c = await db.prepare(
      `SELECT SUM(o.clasificacion = 'falla') afectados, SUM(o.clasificacion = 'powerfail') sin_luz, SUM(o.clasificacion = 'caida_previa') caida_previa
         FROM auditoria_onus o JOIN ticket_auditoria ta ON ta.auditoria_id = o.auditoria_id AND ta.olt = o.olt_nombre AND ta.tarjeta = o.tarjeta AND ta.puerto = o.puerto
        WHERE o.auditoria_id = ? AND ta.ticket_id = ?`).bind(audId, t.ticket_id).first();
    Object.assign(t, { afectados: c.afectados || 0, sin_luz: c.sin_luz || 0, caida_previa: c.caida_previa || 0 });
  }
  const cp = (await db.prepare("SELECT COUNT(*) n FROM auditoria_onus WHERE auditoria_id = ? AND clasificacion = 'caida_previa'").bind(audId).first()).n;
  const al = (await db.prepare("SELECT id, olt, tarjeta, puerto, n_onus, estado, ticket_id FROM alertas_no_reportadas WHERE auditoria_id = ? ORDER BY olt, tarjeta, puerto").bind(audId).all()).results;
  return { tickets, caida_previa: cp, alertas: al, alertas_abiertas: al.filter((a) => a.estado === "abierta").length };
}

// Re-evalúa las auditorías que pueden tocar a un ticket (por sus OLT, o porque ya estaban asociadas a él).
export async function reevaluarTicket(db, ticketId) {
  const eq = await mapaEquivalencias(db);
  const regs = (await db.prepare("SELECT p.olt, t.fecha_apertura_cmr FROM ticket_puertos p JOIN tickets t ON t.id = p.ticket_id WHERE t.id = ?").bind(ticketId).all()).results;
  const olts = [...new Set(regs.map((r) => canon(r.olt, eq)).filter(Boolean).flatMap((c) => variantes(c, eq)))];
  const ids = new Set((await db.prepare("SELECT DISTINCT auditoria_id id FROM ticket_auditoria WHERE ticket_id = ?").bind(ticketId).all()).results.map((r) => r.id));
  if (olts.length) {
    const apertura = pad(regs[0] && regs[0].fecha_apertura_cmr);
    const q = (await db.prepare(
      `SELECT DISTINCT a.id FROM auditorias a JOIN auditoria_onus o ON o.auditoria_id = a.id
        WHERE a.total_onus > 0 AND o.olt_nombre IN (${olts.map(() => "?").join(",")}) ${apertura ? "AND a.fecha_auditoria_local >= ?" : ""}
        ORDER BY a.fecha_auditoria_local DESC LIMIT 60`).bind(...olts, ...(apertura ? [apertura] : [])).all()).results;
    q.forEach((r) => ids.add(r.id));
  }
  for (const id of ids) await reevaluarAuditoria(db, id);
  return ids.size;
}

// Los tickets eliminados dejan alertas "cubierta" sin ticket: se reabren.
export async function reabrirAlertasHuerfanas(db) {
  await db.prepare("UPDATE alertas_no_reportadas SET estado = 'abierta' WHERE estado = 'cubierta' AND ticket_id IS NULL").run();
}

// Llamar desde los endpoints de tickets: nunca debe romper la operación principal (si el módulo aún no está instalado, no hace nada).
export function programarReevaluacion(context, ticketIds) {
  const ids = [...new Set((Array.isArray(ticketIds) ? ticketIds : [ticketIds]).filter(Boolean))];
  if (!ids.length) return Promise.resolve();
  const tarea = (async () => {
    try { for (const id of ids) await reevaluarTicket(context.env.DB, id); } catch (e) { /* módulo de clientes no instalado o dato raro: no afecta al ticket */ }
  })();
  if (typeof context.waitUntil === "function") { context.waitUntil(tarea); return Promise.resolve(); }
  return tarea;
}
