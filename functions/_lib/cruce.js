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
const COLS = `c.carga_id, c.cuenta, c.sucursal, c.nombre, c.telefono_casa, c.telefono_oficina, c.cedula, c.cedula_norm, c.sector,
              c.estado_contrato, c.fecha_creacion, c.serial_norm, c.nombre_norm,
              c.direccion, c.correo, c.correo_iptv, c.municipio, c.parroquia`;
const FROM = `FROM clientes_base c`;

// Busca en D1 todo lo necesario para un lote de ONUs. D1 admite 90 parámetros por consulta.
// Cada sucursal tiene su propia tabla (llave = cuenta). Para cada ONU se busca solo en las tablas de las sucursales de su OLT:
//   Fase 1: por serial (una lectura de la tabla de la sucursal). Fase 2: SOLO para las ONUs que no cruzaron por serial:
//   por cuenta (llave de la tabla: casi sin lecturas) y por cédula / nombre (leen la tabla de la sucursal; solo si opts.barrido lo permite).
// Las sucursales que aún no se han vuelto a cargar en su tabla nueva se siguen buscando en la tabla vieja (clientes_base).
export async function buscarClientes(db, lista, opts = {}) {
  if (opts.soloSerial) opts = { ...opts, barrido: false, soloSerial: true };
  else if (opts.barrido === undefined) opts = { ...opts, barrido: true };
  let leidas = 0;
  const contar = (res) => { for (const r of res) leidas += Number((r && r.meta && r.meta.rows_read) || 0); return res; };
  const mapas = { serial_norm: new Map(), cuenta: new Map(), cedula_norm: new Map(), nombre_norm: new Map() };
  const buscados = { cuenta: new Set(), cedula_norm: new Set(), nombre_norm: new Set() };
  // Solo se anota lo que de verdad se buscó (así "único" sigue significando único dentro de lo buscado)
  const meter = (col, rows) => { for (const f of rows) { const key = f[col]; if (key === null || key === undefined) continue; if (buscados[col] && !buscados[col].has(key)) continue; if (!mapas[col].has(key)) mapas[col].set(key, []); mapas[col].get(key).push(f); } };

  const ctx = opts.sucursales || { tablas: new Map(), vieja: true, sucursalesDe: () => [] };
  const migradas = [...ctx.tablas.keys()];
  const EXCL = migradas.length ? ` AND c.sucursal NOT IN (${migradas.map((m) => "'" + m.replace(/'/g, "''") + "'").join(",")})` : "";
  const todasTablas = [...ctx.tablas.entries()];                       // [sucursal, tabla]
  // Dónde buscar a cada ONU: tablas nuevas de su(s) sucursal(es) y/o la tabla vieja
  const dondeDe = lista.map((_, i) => {
    const sucs = opts.olts && opts.olts[i] ? ctx.sucursalesDe(opts.olts[i]) : [];
    // vieja: true = toda la tabla vieja; lista = solo esas sucursales de la tabla vieja; false = no se usa
    if (!sucs.length) return { tablas: opts.barrido ? todasTablas : [], vieja: ctx.vieja };           // OLT sin sucursal: antes se buscaba en toda la base
    const pend = sucs.filter((s) => !ctx.tablas.has(s));
    return { tablas: sucs.filter((s) => ctx.tablas.has(s)).map((s) => [s, ctx.tablas.get(s)]), vieja: ctx.vieja && pend.length ? pend : false };
  });
  let omitidas = 0;
  const nuevas = (filas) => filas.map((f) => ({ ...f, _t: 1 }));        // marca las filas que vienen de tablas nuevas

  // ---- Fase 1: serial ----
  const sPorTabla = new Map(), sViejos = new Set();
  lista.forEach((k, i) => {
    if (!k.snNorm) return;
    dondeDe[i].tablas.forEach(([, t]) => { if (!sPorTabla.has(t)) sPorTabla.set(t, new Set()); sPorTabla.get(t).add(k.snNorm); });
    if (dondeDe[i].vieja) sViejos.add(k.snNorm);
  });
  const st1 = [], tipo1 = [];
  // Las tablas de sucursal no tienen índice por serial: se leen enteras. Con json_each todos los seriales van en UNA consulta (una sola lectura de la tabla por lote)
  for (const [t, set] of sPorTabla) for (const parte of chunks([...set], 400)) { st1.push(db.prepare(`SELECT ${COLS} FROM ${t} c WHERE c.serial_norm IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(parte))); tipo1.push(1); }
  for (const parte of chunks([...sViejos], 90)) { st1.push(db.prepare(`SELECT ${COLS} ${FROM} WHERE c.clave IN (${parte.map(() => "?").join(",")})${EXCL}`).bind(...parte)); tipo1.push(0); }
  if (st1.length) contar(await db.batch(st1)).forEach((r, j) => meter("serial_norm", tipo1[j] ? nuevas(r.results) : r.results));

  // ---- Fase 2: las que no cruzaron por serial ----
  const sinSerial = lista.map((k, i) => [k, i]).filter(([k]) => !(k.snNorm && unico(mapas.serial_norm.get(k.snNorm), true)));
  const porTabla = new Map();     // tabla -> { cuenta:Set, scan:{ cedula_norm:Set, nombre_norm:Set } }
  const viejas = { cuenta: new Set(), cedula_norm: new Set(), nombre_norm: new Set() };
  const add = (col, v, k, donde) => {
    if (!v) return;
    if (!k.alcance) k.alcance = { cuenta: { vieja: false, tablas: new Set() }, cedula_norm: { vieja: false, tablas: new Set() }, nombre_norm: { vieja: false, tablas: new Set() } };
    const al = k.alcance[col];
    for (const [suc, t] of donde.tablas) {
      if (col !== "cuenta" && !opts.barrido) { omitidas++; continue; }      // cédula / nombre leen la tabla entera de la sucursal
      if (!porTabla.has(t)) porTabla.set(t, { cuenta: new Set(), cedula_norm: new Set(), nombre_norm: new Set() });
      porTabla.get(t)[col].add(v); al.tablas.add(suc); buscados[col].add(v);
    }
    if (donde.vieja) {
      if (!opts.barrido) { omitidas++; return; }                           // la tabla vieja se barre entera: solo con permiso
      viejas[col].add(v); al.vieja = al.vieja === true || donde.vieja === true ? true : new Set([...(al.vieja || []), ...donde.vieja]); buscados[col].add(v);
    }
  };
  for (const [k, i] of sinSerial) {
    [...k.contactC, ...k.cuentaName].forEach((c) => add("cuenta", c, k, dondeDe[i]));
    k.cedulas.forEach((c) => add("cedula_norm", c, k, dondeDe[i]));
    if (k.nombreC) add("nombre_norm", k.nombreC, k, dondeDe[i]);
  }
  const st2 = [], tipo2 = [];
  for (const [t, cols] of porTabla) {
    for (const parte of chunks([...cols.cuenta], 90)) { st2.push(db.prepare(`SELECT ${COLS} FROM ${t} c WHERE c.cuenta IN (${parte.map(() => "?").join(",")})`).bind(...parte)); tipo2.push(1); }
    const scan = [...cols.cedula_norm].map((v) => ["cedula_norm", v]).concat([...cols.nombre_norm].map((v) => ["nombre_norm", v]));
    for (const parte of chunks(scan, 400)) {
      const por = { cedula_norm: [], nombre_norm: [] }; parte.forEach(([c, v]) => por[c].push(v));
      const cond = Object.entries(por).filter(([, v]) => v.length).map(([c]) => `c.${c} IN (SELECT value FROM json_each(?))`);
      st2.push(db.prepare(`SELECT ${COLS} FROM ${t} c WHERE ${cond.join(" OR ")}`).bind(...Object.entries(por).filter(([, v]) => v.length).map(([, v]) => JSON.stringify(v)))); tipo2.push(1);
    }
  }
  const clavesV = Object.entries(viejas).flatMap(([col, set]) => [...set].map((v) => [col, v]));
  for (const parte of chunks(clavesV, 85)) {
    const por = { cuenta: [], cedula_norm: [], nombre_norm: [] };
    parte.forEach(([col, v]) => por[col].push(v));
    const cond = Object.entries(por).filter(([, v]) => v.length).map(([col, v]) => `c.${col} IN (${v.map(() => "?").join(",")})`);
    st2.push(db.prepare(`SELECT ${COLS} ${FROM} WHERE (${cond.join(" OR ")})${EXCL}`).bind(...Object.values(por).flat())); tipo2.push(0);
  }
  mapas.sin_barrido = omitidas > 0;
  if (st2.length) contar(await db.batch(st2)).forEach((r, j) => { const filas = tipo2[j] ? nuevas(r.results) : r.results; meter("cuenta", filas); meter("cedula_norm", filas); meter("nombre_norm", filas); });
  mapas.lecturas = leidas;
  return mapas;
}

// "2026-10-04 09:30", "2026-10-04T09:30:00" o "04/10/2026 9:30" -> número comparable (o null)
function fechaNum(v) {
  const t = String(v || "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) { const d = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); if (d) m = [d[0], d[3], d[2].padStart(2, "0"), d[1].padStart(2, "0"), d[4], d[5]]; }
  if (!m) return null;
  return Number(`${m[1]}${m[2]}${m[3]}`) * 10000 + Number(m[4] || 0) * 100 + Number(m[5] || 0);
}
// Si hay varios candidatos: se queda con el único contrato Activo; si sigue ambiguo, no hay coincidencia.
// Con recientes=true (cruce por serial de ONU: el mismo equipo pudo pasar de un cliente a otro con los años)
// entre varios Activos gana el de fecha de creación más reciente, siempre que no haya empate.
function unico(cands, recientes = false) {
  if (!cands || !cands.length) return null;
  const distintos = [...new Map(cands.map((f) => [f.carga_id + "|" + f.cuenta, f])).values()];
  if (distintos.length === 1) return distintos[0];
  const act = distintos.filter((f) => String(f.estado_contrato).toLowerCase() === "activo");
  if (act.length === 1) return act[0];
  if (recientes && act.length > 1) {
    const con = act.map((f) => ({ f, n: fechaNum(f.fecha_creacion) }));
    if (con.every((x) => x.n !== null)) {
      const max = Math.max(...con.map((x) => x.n));
      const tope = con.filter((x) => x.n === max);
      if (tope.length === 1) return tope[0].f;
    }
  }
  return null;
}

// Candidatos de una clave para ESTA ONU: si se buscó solo en algunas sucursales, solo valen los de esas sucursales
const vale = (k, col, lista) => {
  const al = k.alcance && k.alcance[col];
  if (!lista) return [];
  if (!al) return lista;
  return lista.filter((f) => (f._t ? al.tablas.has(f.sucursal) : al.vieja === true || (al.vieja && al.vieja.has(f.sucursal))));
};
// Cascada para UNA ONU. Devuelve { cliente, metodo } o { cliente: null, metodo: null }.
export function cruzarUna(k, mapas) {
  let f = k.snNorm ? unico(mapas.serial_norm.get(k.snNorm), true) : null;
  if (f) return { cliente: f, metodo: "serial" };
  for (const c of k.contactC) { f = unico(vale(k, "cuenta", mapas.cuenta.get(c))); if (f) return { cliente: f, metodo: "contact" }; }
  for (const c of k.cuentaName) { f = unico(vale(k, "cuenta", mapas.cuenta.get(c))); if (f) return { cliente: f, metodo: "cuenta_en_name" }; }
  if (k.cedulas.length) {
    const encontrados = k.cedulas.flatMap((c) => vale(k, "cedula_norm", mapas.cedula_norm.get(c)));
    f = unico(encontrados);
    if (f) return { cliente: f, metodo: "cedula_en_name" };
  }
  if (k.nombreC) {
    const cands = vale(k, "nombre_norm", mapas.nombre_norm.get(k.nombreC));
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

// Qué bases vigentes están fuera de tolerancia (parámetro tolerancia_base_horas, 12 h por defecto) frente a la hora de la auditoría de SmartOLT.
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

