// Cuántos cambios de la base de clientes se han escrito hoy (el contador de D1 se reinicia a las 00:00 UTC = 8:00 pm de Caracas).
// cargas_base.fecha se guarda en UTC (CURRENT_TIMESTAMP), así que "hoy" coincide con el día de Cloudflare.
export const TOPE_DIA = 80000;
export async function usadoHoy(db) {
  const r = await db.prepare(
    `SELECT COALESCE(SUM(COALESCE(nuevas, 0) + COALESCE(cambiadas, 0) + COALESCE(bajas, 0)), 0) AS n
       FROM cargas_base WHERE date(fecha) = date('now')`).first();
  return Number((r && r.n) || 0);
}
