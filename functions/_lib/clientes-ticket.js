// Paso 5: números de clientes afectados por ticket / registro, calculados con las auditorías vigentes asociadas (Paso 4).
//   falla    = ONUs en LOS / Offline que ya estaban bien antes de la falla
//   sin_luz  = ONUs en Power fail
// Una auditoría vigente cubre un PUERTO FÍSICO; cada puerto se reparte al registro del ticket que lo cubre con más detalle
// (puerto > tarjeta > solo OLT), así la suma de los registros coincide con el total del ticket y nada se cuenta dos veces.
import { mapaEquivalencias, canon, numDe } from "./asociacion.js";

const SQL_PUERTOS_VIGENTES = `
  SELECT ta.ticket_id, ta.olt, ta.tarjeta, ta.puerto,
         SUM(o.clasificacion = 'falla') AS falla, SUM(o.clasificacion = 'powerfail') AS sin_luz
    FROM ticket_auditoria ta
    JOIN auditoria_onus o ON o.auditoria_id = ta.auditoria_id AND o.olt_nombre = ta.olt AND o.tarjeta = ta.tarjeta AND o.puerto = ta.puerto
   WHERE ta.vigente = 1
   GROUP BY ta.id`;

// Agrega clientes_falla y clientes_sin_luz a cada fila de /api/consulta (null = el registro no tiene ninguna auditoría asociada).
export async function agregarConteosClientes(db, filas) {
  filas.forEach((f) => { f.clientes_falla = null; f.clientes_sin_luz = null; });
  if (!filas.length) return filas;
  let puertos;
  try { puertos = (await db.prepare(SQL_PUERTOS_VIGENTES).all()).results; } catch (e) { return filas; }   // módulo de clientes no instalado
  if (!puertos.length) return filas;
  const eq = await mapaEquivalencias(db);
  const porTicket = new Map();
  puertos.forEach((p) => { if (!porTicket.has(p.ticket_id)) porTicket.set(p.ticket_id, []); porTicket.get(p.ticket_id).push(p); });
  const regsTicket = new Map();
  filas.forEach((f) => {
    if (!porTicket.has(f.ticket_id)) return;
    if (!regsTicket.has(f.ticket_id)) regsTicket.set(f.ticket_id, []);
    regsTicket.get(f.ticket_id).push({ f, canon: canon(f.olt, eq), tar: numDe(f.tarjeta), pue: numDe(f.puerto) });
  });
  for (const [tid, regs] of regsTicket) {
    for (const p of porTicket.get(tid)) {
      const co = canon(p.olt, eq);
      const cubre = regs.filter((r) => co && r.canon === co && (r.tar === null || r.tar === p.tarjeta) && (r.tar === null || r.pue === null || r.pue === p.puerto));
      if (!cubre.length) continue;
      cubre.sort((a, b) => ((b.tar !== null) + (b.pue !== null)) - ((a.tar !== null) + (a.pue !== null)));
      const f = cubre[0].f;
      f.clientes_falla = (f.clientes_falla || 0) + (p.falla || 0);
      f.clientes_sin_luz = (f.clientes_sin_luz || 0) + (p.sin_luz || 0);
    }
  }
  return filas;
}
