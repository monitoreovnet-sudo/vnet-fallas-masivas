// Paso 6: consulta de clientes afectados (todas las auditorías vigentes asociadas a tickets) para verla en pantalla y descargarla.
// Cada fila = una ONU de un puerto cubierto por un ticket, con la copia del cliente que se guardó al auditar y los datos del ticket.
import { mapaEquivalencias, canon, numDe, variantes } from "./asociacion.js";

export const TIPOS_AFECTACION = ["falla", "powerfail", "caida_previa"];
const MAX_FILAS = 60000;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// filtros: { ticket, oficina_id, olt, desde, hasta, tipos: [..], activos: bool, sin_cruzar: bool }
export async function consultarClientes(db, f) {
  const eq = await mapaEquivalencias(db);
  const tipos = (f.tipos || []).filter((t) => TIPOS_AFECTACION.includes(t));
  if (!tipos.length) tipos.push("falla", "powerfail");
  const where = ["ta.vigente = 1", `o.clasificacion IN (${tipos.map(() => "?").join(",")})`];
  const binds = [...tipos];
  if (f.ticket) { where.push("t.ticket_cmr LIKE ?"); binds.push(`%${String(f.ticket).replace(/[^\dA-Za-z-]/g, "")}%`); }
  if (f.olt) {
    const co = canon(f.olt, eq), vs = co ? variantes(co, eq) : [String(f.olt).trim().toUpperCase()];
    where.push(`ta.olt IN (${vs.map(() => "?").join(",")})`); binds.push(...vs);
  }
  if (FECHA.test(f.desde || "")) { where.push("a.fecha_auditoria_local >= ?"); binds.push(f.desde + "T00:00:00"); }
  if (FECHA.test(f.hasta || "")) { where.push("a.fecha_auditoria_local <= ?"); binds.push(f.hasta + "T23:59:59"); }

  const filas = (await db.prepare(
    `SELECT ta.ticket_id, t.ticket_cmr, t.fecha_apertura_cda, t.fecha_apertura_cmr, t.fecha_solucion_cda AS t_sol_cda, t.fecha_solucion_cmr AS t_sol_cmr,
            ta.olt, ta.tarjeta, ta.puerto, a.fecha_auditoria_local, ta.revisar_duplicado AS duplicado,
            o.clasificacion, o.status, o.last_status_change, o.cuenta, o.cli_nombre, o.cli_tel_casa, o.cli_tel_oficina, o.cli_telefono,
            o.cli_ident_externo, o.cli_cedula, o.cli_sector, o.cli_estado_contrato, o.name_smartolt, o.base_desactualizada
       FROM ticket_auditoria ta
       JOIN tickets t ON t.id = ta.ticket_id
       JOIN auditorias a ON a.id = ta.auditoria_id
       JOIN auditoria_onus o ON o.auditoria_id = ta.auditoria_id AND o.olt_nombre = ta.olt AND o.tarjeta = ta.tarjeta AND o.puerto = ta.puerto
      WHERE ${where.join(" AND ")}
      ORDER BY t.ticket_cmr DESC, ta.olt, ta.tarjeta, ta.puerto, CAST(o.onu_num AS INTEGER) LIMIT ${MAX_FILAS + 1}`).bind(...binds).all()).results;
  const truncado = filas.length > MAX_FILAS;
  if (truncado) filas.pop();

  // Registro del ticket que cubre cada puerto (el más específico): de ahí salen la oficina y los cierres
  const ids = [...new Set(filas.map((r) => r.ticket_id))];
  const regsPorTicket = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const parte = ids.slice(i, i + 80);
    const regs = (await db.prepare(
      `SELECT p.ticket_id, p.oficina_id, o.nombre AS oficina_nombre, p.olt, p.tarjeta, p.puerto,
              p.fecha_solucion_cda, p.fecha_solucion_cmr, p.fecha_cierre_cda, p.fecha_cierre_cmr
         FROM ticket_puertos p LEFT JOIN oficinas o ON o.id = p.oficina_id WHERE p.ticket_id IN (${parte.map(() => "?").join(",")})`).bind(...parte).all()).results;
    regs.forEach((r) => {
      if (!regsPorTicket.has(r.ticket_id)) regsPorTicket.set(r.ticket_id, []);
      regsPorTicket.get(r.ticket_id).push({ ...r, canon: canon(r.olt, eq), tar: numDe(r.tarjeta), pue: numDe(r.puerto) });
    });
  }
  const filtroOficina = f.oficina_id ? String(f.oficina_id) : "";
  const salida = [];
  let sinCruzarExcl = 0, noActivosExcl = 0;
  for (const r of filas) {
    const co = canon(r.olt, eq);
    const cubre = (regsPorTicket.get(r.ticket_id) || []).filter((g) => co && g.canon === co && (g.tar === null || g.tar === r.tarjeta) && (g.tar === null || g.pue === null || g.pue === r.puerto));
    cubre.sort((a, b) => ((b.tar !== null) + (b.pue !== null)) - ((a.tar !== null) + (a.pue !== null)));
    const g = cubre[0] || null;
    if (filtroOficina && !(g && String(g.oficina_id) === filtroOficina)) continue;
    const activo = String(r.cli_estado_contrato || "").trim().toLowerCase() === "activo";
    if (!r.cuenta) { if (!f.sin_cruzar) { sinCruzarExcl++; continue; } }
    else if (f.activos && !activo) { noActivosExcl++; continue; }
    salida.push({
      ticket_cmr: r.ticket_cmr, oficina: g ? g.oficina_nombre : null, olt: r.olt, tarjeta: r.tarjeta, puerto: r.puerto,
      fecha_auditoria: r.fecha_auditoria_local, clasificacion: r.clasificacion, estado_onu: r.status, ultimo_cambio: r.last_status_change,
      cuenta: r.cuenta, nombre: r.cli_nombre, telefono_casa: r.cli_tel_casa || r.cli_telefono || null, telefono_oficina: r.cli_tel_oficina || null,
      sector: r.cli_sector, identificacion_externo: r.cli_ident_externo || r.cli_cedula || null, estado_contrato: r.cli_estado_contrato,
      observacion: r.cuenta ? "" : "Sin cruzar" + (r.name_smartolt ? " · " + r.name_smartolt : ""),
      apertura_cda: r.fecha_apertura_cda, apertura_cmr: r.fecha_apertura_cmr,
      solucion_cda: (g && g.fecha_solucion_cda) || r.t_sol_cda || null, solucion_cmr: (g && g.fecha_solucion_cmr) || r.t_sol_cmr || null,
      cierre_cda: g ? g.fecha_cierre_cda : null, cierre_cmr: g ? g.fecha_cierre_cmr : null,
      duplicado: r.duplicado ? 1 : 0, base_desactualizada: r.base_desactualizada ? 1 : 0,
    });
  }
  const cuentas = new Set(salida.filter((x) => x.cuenta).map((x) => x.cuenta));
  return {
    filas: salida,
    resumen: { onus: salida.length, clientes: cuentas.size, tickets: new Set(salida.map((x) => x.ticket_cmr)).size,
      sin_cruzar_excluidas: sinCruzarExcl, no_activos_excluidos: noActivosExcl, truncado },
  };
}
