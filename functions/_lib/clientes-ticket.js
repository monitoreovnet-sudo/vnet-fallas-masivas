// Clientes afectados por ticket / registro (Paso 5). Los números se calculan UNA vez y se guardan en ticket_clientes_conteo
// (ver recalcularConteos en asociacion.js); la consulta de los informes solo los LEE, así no se suman miles de ONUs en cada consulta.
//   falla = ONUs en LOS / Offline que ya estaban bien antes de la falla · sin_luz = ONUs en Power fail
import { recalcularConteos } from "./asociacion.js";

// Agrega clientes_falla y clientes_sin_luz a cada fila de /api/consulta (null = el registro no tiene ninguna auditoría asociada).
export async function agregarConteosClientes(db, filas) {
  filas.forEach((f) => { f.clientes_falla = null; f.clientes_sin_luz = null; });
  if (!filas.length) return filas;
  let listo;
  try { listo = await db.prepare("SELECT valor FROM parametros_cruce WHERE clave = 'conteos_clientes_listo'").first(); } catch (e) { return filas; }
  if (!listo) return filas;   // migración 050 sin ejecutar: columnas vacías
  if (listo.valor !== "1") {
    // Primera vez después de la migración: se llenan UNA sola vez los tickets que ya tenían auditorías asociadas.
    const ids = (await db.prepare("SELECT DISTINCT ticket_id FROM ticket_auditoria WHERE vigente = 1").all()).results.map((r) => r.ticket_id);
    await recalcularConteos(db, ids);
    await db.prepare("UPDATE parametros_cruce SET valor = '1' WHERE clave = 'conteos_clientes_listo'").run();
  }
  const guardados = new Map((await db.prepare("SELECT ticket_puerto_id AS id, falla, sin_luz FROM ticket_clientes_conteo").all()).results.map((r) => [r.id, r]));
  filas.forEach((f) => {
    const c = guardados.get(f.puerto_id);
    if (c) { f.clientes_falla = c.falla; f.clientes_sin_luz = c.sin_luz; }
  });
  return filas;
}
