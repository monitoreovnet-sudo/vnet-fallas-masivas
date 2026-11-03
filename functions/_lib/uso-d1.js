// Contador integral de escrituras de D1 del día. El contador de Cloudflare se reinicia a las 00:00 UTC = 8:00 pm de Caracas.
// - Base de clientes de Grafana: se cuenta desde cargas_base (cambios escritos, fecha en UTC).
// - Todo lo demás (auditorías de SmartOLT, mapa de clientes, ONUs de tickets, cruces): escrituras REALES que reporta D1 (meta.rows_written,
//   incluye índices), acumuladas por origen en la tabla uso_d1.
export const TOPE_DIA = 80000;       // tope que se respeta (el real gratuito es 100.000)
export const TOPE_REAL = 100000;

export const ORIGENES = {
  grafana: "Base de clientes (Grafana)", auditoria: "Archivos de SmartOLT (auditoría)", mapa: "Mapa de clientes (Informe 2)",
  ticket_onus: "ONUs de tickets", cruce_ticket: "Cruce de ONUs de tickets", recruce: "Recruce de auditorías",
};

// Suma las escrituras que reporta D1 en un resultado de run() o de batch()
export function escrituras(res) {
  const una = (r) => Number((r && r.meta && r.meta.rows_written) || 0);
  return Array.isArray(res) ? res.reduce((s, r) => s + una(r), 0) : una(res);
}

// Anota escrituras del día. Nunca rompe la operación que se está haciendo.
export async function registrarUso(db, origen, filas) {
  const n = Math.round(Number(filas) || 0);
  if (n <= 0) return;
  try {
    await db.prepare(
      `INSERT INTO uso_d1 (dia, origen, filas) VALUES (date('now'), ?, ?) ON CONFLICT(dia, origen) DO UPDATE SET filas = filas + excluded.filas`).bind(origen, n).run();
  } catch (e) { /* falta migración 043: no se cuenta, pero no se rompe nada */ }
}

export async function detalleHoy(db) {
  const g = await db.prepare(
    `SELECT COALESCE(SUM(COALESCE(nuevas, 0) + COALESCE(cambiadas, 0) + COALESCE(bajas, 0)), 0) AS n FROM cargas_base WHERE date(fecha) = date('now')`).first();
  const detalle = [{ origen: "grafana", nombre: ORIGENES.grafana, filas: Number((g && g.n) || 0) }];
  try {
    (await db.prepare("SELECT origen, filas FROM uso_d1 WHERE dia = date('now') ORDER BY filas DESC").all()).results
      .forEach((r) => detalle.push({ origen: r.origen, nombre: ORIGENES[r.origen] || r.origen, filas: r.filas }));
  } catch (e) { /* sin migración 043 */ }
  return detalle;
}
export async function usadoHoy(db) { return (await detalleHoy(db)).reduce((s, d) => s + d.filas, 0); }
