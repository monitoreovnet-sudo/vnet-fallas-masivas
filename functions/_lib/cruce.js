// Cruce SmartOLT -> cliente (Grafana). Cascada, se detiene en la primera coincidencia:
//   1) SN = Serial ONU   2) Contact = Número de Cuenta   3) cuenta dentro de Name
//   4) cédula dentro de Name   5) nombre normalizado exacto Y ÚNICO.
// Nada de coincidencias aproximadas: lo que no cruce queda "sin cruzar" para revisión manual.
import { normSerial, normNombre } from "./clientes.js";

const sinCeros = (s) => String(s).replace(/^0+(?=\d)/, "");
export const METODOS = ["serial", "contact", "cuenta_en_name", "cedula_en_name", "nombre"];

// "16/10/2026 15:33" o "2026-04-20 00:14:26.000000" -> "AAAA-MM-DDTHH:MM:SS" (null si no se reconoce)
export function normFechaCambio(v) {
  const s = String(v ?? "").trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] || "00"}`;
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}`;
  return null;
}

// Status de SmartOLT -> clasificación. "caida_previa" se decide al asociar con un ticket (Paso 4).
export function clasificar(status) {
  const s = String(status ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (s === "los" || s === "offline") return "falla";
  if (s === "power fail" || s === "powerfail") return "powerfail";
  if (s === "online") return "online";
  return "otro";
}

// Datos que se pueden sacar de una ONU para buscar al cliente
export function claves(onu) {
  const snNorm = normSerial(onu.sn) || null;
  const contact = String(onu.contact ?? "").trim();
  const contactC = /^\d+$/.test(contact) ? [...new Set([contact, sinCeros(contact)])] : [];
  const name = String(onu.name ?? "");
  const mc = /^\s*\(?\s*(\d{3,})\s*\)?(?!\d)/.exec(name);
  const cuentaName = mc ? [...new Set([mc[1], sinCeros(mc[1])])] : [];
  const md = /(?:^|\s)-\s*(\d{5,10})\b/.exec(name);
  const ced = md ? md[1].padStart(9, "0") : null;
  const cedulas = ced && ced.length === 9 ? ["V", "E"].map((l) => l + ced) : [];
  const nombre = normNombre(name);
  const nombreC = nombre.split(" ").filter(Boolean).length >= 2 ? nombre : null;
  return { snNorm, contactC, cuentaName, cedulas, nombreC };
}

const chunks = (arr, n) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
const COLS = `c.carga_id, c.cuenta, c.sucursal, c.nombre, c.telefono_casa, c.telefono_oficina, c.cedula_norm, c.sector,
              c.estado_contrato, c.serial_norm, c.nombre_norm, g.fecha_base`;
const FROM = `FROM clientes_base c JOIN cargas_base g ON g.id = c.carga_id AND g.estado = 'vigente'`;

// Busca en D1 (todas las bases vigentes) todo lo necesario para un lote de ONUs. D1 admite 90 parámetros por consulta.
export async function buscarClientes(db, lista) {
  const campos = { serial_norm: new Set(), cuenta: new Set(), cedula_norm: new Set(), nombre_norm: new Set() };
  for (const k of lista) {
    if (k.snNorm) campos.serial_norm.add(k.snNorm);
    [...k.contactC, ...k.cuentaName].forEach((c) => campos.cuenta.add(c));
    k.cedulas.forEach((c) => campos.cedula_norm.add(c));
    if (k.nombreC) campos.nombre_norm.add(k.nombreC);
  }
  const stmts = [], tags = [];
  for (const [col, set] of Object.entries(campos)) {
    for (const parte of chunks([...set], 90)) {
      stmts.push(db.prepare(`SELECT ${COLS} ${FROM} WHERE c.${col} IN (${parte.map(() => "?").join(",")})`).bind(...parte));
      tags.push(col);
    }
  }
  const mapas = { serial_norm: new Map(), cuenta: new Map(), cedula_norm: new Map(), nombre_norm: new Map() };
  if (stmts.length) {
    const res = await db.batch(stmts);
    res.forEach((r, i) => {
      const col = tags[i];
      for (const f of r.results) { const key = f[col]; if (!mapas[col].has(key)) mapas[col].set(key, []); mapas[col].get(key).push(f); }
    });
  }
  return mapas;
}

// Si hay varios candidatos: se queda con el único contrato Activo; si sigue ambiguo, no hay coincidencia.
function unico(cands) {
  if (!cands || !cands.length) return null;
  const distintos = [...new Map(cands.map((f) => [f.carga_id + "|" + f.cuenta, f])).values()];
  if (distintos.length === 1) return distintos[0];
  const act = distintos.filter((f) => String(f.estado_contrato).toLowerCase() === "activo");
  return act.length === 1 ? act[0] : null;
}

// Cascada para UNA ONU. Devuelve { cliente, metodo } o { cliente: null, metodo: null }.
export function cruzarUna(k, mapas) {
  let f = k.snNorm ? unico(mapas.serial_norm.get(k.snNorm)) : null;
  if (f) return { cliente: f, metodo: "serial" };
  for (const c of k.contactC) { f = unico(mapas.cuenta.get(c)); if (f) return { cliente: f, metodo: "contact" }; }
  for (const c of k.cuentaName) { f = unico(mapas.cuenta.get(c)); if (f) return { cliente: f, metodo: "cuenta_en_name" }; }
  if (k.cedulas.length) {
    const encontrados = k.cedulas.flatMap((c) => mapas.cedula_norm.get(c) || []);
    f = unico(encontrados);
    if (f) return { cliente: f, metodo: "cedula_en_name" };
  }
  if (k.nombreC) {
    const cands = mapas.nombre_norm.get(k.nombreC) || [];
    // nombre exacto y ÚNICO en toda la base (no se desempata por contrato activo)
    if (cands.length === 1) return { cliente: cands[0], metodo: "nombre" };
  }
  return { cliente: null, metodo: null };
}

const horasEntre = (a, b) => Math.abs(new Date(a + "Z") - new Date(b + "Z")) / 3600000;
export { horasEntre };

export async function leerParametro(db, clave, porDefecto) {
  try {
    const r = await db.prepare("SELECT valor FROM parametros_cruce WHERE clave = ?").bind(clave).first();
    const n = r ? Number(r.valor) : NaN;
    return Number.isFinite(n) ? n : porDefecto;
  } catch (e) { return porDefecto; }
}

// Qué bases vigentes están fuera de tolerancia frente a la hora de la auditoría
export async function basesDesactualizadas(db, aud) {
  const tol = await leerParametro(db, "tolerancia_base_horas", 12);
  const bases = (await db.prepare("SELECT id, fecha_base FROM cargas_base WHERE estado = 'vigente'").all()).results;
  const m = new Map();
  for (const g of bases) m.set(g.id, horasEntre(aud.fecha_auditoria_local, g.fecha_base) > tol);
  return { mapa: new Map([...m].filter(([, v]) => v)), alguna: [...m.values()].some(Boolean) };
}

export async function resumenAuditoria(db, id) {
  const q = async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results;
  const tot = (await q(
    `SELECT COUNT(*) total,
            SUM(cuenta IS NOT NULL) cruzadas,
            SUM(cuenta IS NULL) sin_cruzar,
            SUM(cuenta IS NOT NULL AND LOWER(cli_estado_contrato) = 'activo') cruzadas_activas,
            SUM(clasificacion = 'falla') falla, SUM(clasificacion = 'powerfail') powerfail,
            SUM(clasificacion = 'online') online, SUM(clasificacion = 'otro') otro,
            SUM(clasificacion = 'falla' AND cuenta IS NULL) falla_sin_cruzar,
            SUM(base_desactualizada = 1) desactualizadas
       FROM auditoria_onus WHERE auditoria_id = ?`, id))[0];
  const metodos = await q("SELECT metodo_cruce m, COUNT(*) n FROM auditoria_onus WHERE auditoria_id = ? AND cuenta IS NOT NULL GROUP BY metodo_cruce", id);
  const sin = await q(
    `SELECT sn, name_smartolt, contact, status, tarjeta, puerto, last_status_change FROM auditoria_onus
      WHERE auditoria_id = ? AND cuenta IS NULL ORDER BY (clasificacion = 'falla') DESC, id LIMIT 50`, id);
  const out = { ...tot, metodos: Object.fromEntries(metodos.map((r) => [r.m, r.n])), sin_cruzar_lista: sin };
  for (const k of Object.keys(out)) if (out[k] === null) out[k] = 0;
  return out;
}

