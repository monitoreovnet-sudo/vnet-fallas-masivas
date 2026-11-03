// Informe 2: reporte general de clientes por Oficina → OLT → clientes.
// "Clientes conocidos de una OLT" = toda ONU que apareció en un archivo de SmartOLT (en cualquier estado) o en un ticket y cruzó con Grafana: tabla clientes_olt.
// Grafana no trae la OLT/tarjeta/puerto: esa ubicación solo la da SmartOLT, por eso el reporte crece con cada archivo de SmartOLT que se sube.
import { mapaEquivalencias, canon, numDe, variantes } from "./asociacion.js";

const MAX_CLIENTES = 20000;
const trozos = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };

// Catálogo de OLTs con su oficina, indexado por código canónico (CRC y CRP son la misma OLT)
async function catalogo(db) {
  const eq = await mapaEquivalencias(db);
  const filas = (await db.prepare(
    `SELECT o.codigo, o.oficina_id, f.nombre AS oficina FROM olts o LEFT JOIN oficinas f ON f.id = o.oficina_id WHERE o.activo = 1`).all()).results;
  const porCanon = new Map();
  for (const r of filas) { const c = canon(r.codigo, eq); if (c && !porCanon.has(c)) porCanon.set(c, { codigo: r.codigo, canon: c, oficina_id: r.oficina_id, oficina: r.oficina || null }); }
  return { eq, porCanon };
}
const claveOlt = (nombre, cat) => { const c = canon(nombre, cat.eq); return c || String(nombre || "").trim().toUpperCase(); };
const infoOlt = (nombre, cat) => cat.porCanon.get(claveOlt(nombre, cat)) || { codigo: String(nombre || "").trim().toUpperCase(), canon: claveOlt(nombre, cat), oficina_id: null, oficina: null };

// Clientes conocidos por OLT (nombre tal como viene de SmartOLT) -> cantidad. Sale del contador olt_conteo (no recorre la tabla de clientes).
async function conteoPorOlt(db) {
  return (await db.prepare("SELECT olt, n FROM olt_conteo WHERE n > 0").all()).results;
}

export async function nivelOficinas(db) {
  const cat = await catalogo(db);
  const porOficina = new Map();   // id|"sin" -> { id, nombre, olts:Set, clientes }
  const tomar = (id, nombre) => { const k = id ?? "sin"; if (!porOficina.has(k)) porOficina.set(k, { oficina_id: k, oficina: nombre || "Sin oficina asignada", olts: new Set(), olts_con_clientes: new Set(), clientes: 0 }); return porOficina.get(k); };
  for (const o of cat.porCanon.values()) { if (o.oficina_id) tomar(o.oficina_id, o.oficina).olts.add(o.canon); }
  for (const r of await conteoPorOlt(db)) {
    const i = infoOlt(r.olt, cat); const of = tomar(i.oficina_id, i.oficina);
    of.olts.add(i.canon); of.olts_con_clientes.add(i.canon); of.clientes += r.n;
  }
  const lista = [...porOficina.values()].map((o) => ({ oficina_id: o.oficina_id, oficina: o.oficina, olts: o.olts.size, olts_con_clientes: o.olts_con_clientes.size, clientes: o.clientes }))
    .sort((a, b) => (a.oficina_id === "sin") - (b.oficina_id === "sin") || a.oficina.localeCompare(b.oficina));
  return { oficinas: lista };
}

export async function nivelOlts(db, oficinaId) {
  const cat = await catalogo(db);
  const k = oficinaId === "sin" ? null : Number(oficinaId);
  const olts = new Map();
  for (const o of cat.porCanon.values()) { if ((o.oficina_id ?? null) === k) olts.set(o.canon, { olt: o.codigo, canon: o.canon, clientes: 0 }); }
  for (const r of await conteoPorOlt(db)) {
    const i = infoOlt(r.olt, cat);
    if ((i.oficina_id ?? null) !== k) continue;
    const x = olts.get(i.canon) || { olt: i.codigo, canon: i.canon, clientes: 0 }; x.clientes += r.n; olts.set(i.canon, x);
  }
  const nombre = k === null ? "Sin oficina asignada" : ([...cat.porCanon.values()].find((o) => o.oficina_id === k) || {}).oficina || "";
  return { oficina_id: oficinaId, oficina: nombre, olts: [...olts.values()].sort((a, b) => a.olt.localeCompare(b.olt)) };
}

// Lista de clientes de una o varias OLTs (códigos canónicos). Cada fila = un cliente (su ONU), con su última ubicación conocida.
export async function nivelClientes(db, canonOlts) {
  const cat = await catalogo(db);
  const nombres = new Set();
  for (const c of canonOlts) {
    variantes(c, cat.eq).forEach((v) => nombres.add(v));
    const i = cat.porCanon.get(c); if (i) variantes(canon(i.codigo, cat.eq) || c, cat.eq).forEach((v) => nombres.add(v)); nombres.add(c);
  }
  const lista = [...nombres];
  if (!lista.length) return { clientes: [], truncado: false };
  const ph = lista.map(() => "?").join(",");

  const [mapa, veces1, veces2] = await db.batch([
    db.prepare(
      `SELECT clave, sn_norm, cuenta, olt, tarjeta, puerto, visto, nombre, telefono_casa, telefono_oficina, correo, sector, direccion, municipio, parroquia, estado_contrato
         FROM clientes_olt WHERE olt IN (${ph})`).bind(...lista),
    db.prepare(
      `SELECT DISTINCT COALESCE(o.sn_norm, o.cuenta) AS k, ta.ticket_id
         FROM ticket_auditoria ta JOIN auditoria_onus o ON o.auditoria_id = ta.auditoria_id AND o.olt_nombre = ta.olt AND o.tarjeta = ta.tarjeta AND o.puerto = ta.puerto
        WHERE o.olt_nombre IN (${ph}) AND o.cuenta IS NOT NULL AND o.clasificacion IN ('falla', 'powerfail')`).bind(...lista),
    db.prepare(`SELECT DISTINCT COALESCE(serial, cli_cuenta) AS k, ticket_id FROM ticket_onus WHERE olt IN (${ph}) AND cli_cuenta IS NOT NULL`).bind(...lista),
  ]);

  // Veces afectado = tickets distintos en los que apareció su ONU (falla o sin electricidad en auditorías, o ONU registrada en el ticket)
  const tickets = new Map();
  for (const r of [...veces1.results, ...veces2.results]) { if (!tickets.has(r.k)) tickets.set(r.k, new Set()); tickets.get(r.k).add(r.ticket_id); }

  const clientes = new Map();
  for (const r of mapa.results) {
    const k = r.sn_norm || r.cuenta;
    clientes.set(k, { k, sn: r.sn_norm || "", cuenta: r.cuenta, olt: r.olt, tarjeta: r.tarjeta, puerto: r.puerto, fecha: r.visto || "",
      nombre: r.nombre, tel_casa: r.telefono_casa || "", tel_oficina: r.telefono_oficina || "", correo: r.correo || "", estado: "", ciudad: r.municipio || "", localidad: r.parroquia || "",
      sector: r.sector || "", direccion: r.direccion || "", estado_contrato: r.estado_contrato || "" });
  }
  // Datos vigentes de Grafana (estado, ciudad, localidad, correo, teléfonos, dirección) por serial
  const seriales = [...clientes.values()].map((c) => c.sn).filter(Boolean);
  const lecturas = trozos(seriales, 90).map((p) => db.prepare(
    `SELECT clave, cuenta, nombre, telefono_casa, telefono_oficina, correo, estado_geo, municipio, parroquia, sector, direccion, estado_contrato, sucursal
       FROM clientes_base WHERE clave IN (${p.map(() => "?").join(",")})`).bind(...p));
  const grafana = new Map();
  if (lecturas.length) (await db.batch(lecturas)).forEach((r) => r.results.forEach((g) => grafana.set(g.clave, g)));

  const salida = [];
  for (const c of clientes.values()) {
    const g = grafana.get(c.sn);
    if (g) Object.assign(c, {
      cuenta: g.cuenta || c.cuenta, nombre: g.nombre || c.nombre, tel_casa: g.telefono_casa || c.tel_casa, tel_oficina: g.telefono_oficina || c.tel_oficina, correo: g.correo || c.correo,
      estado: g.estado_geo || c.estado, ciudad: g.municipio || c.ciudad, localidad: g.parroquia || c.localidad, sector: g.sector || c.sector,
      direccion: g.direccion || c.direccion, estado_contrato: g.estado_contrato || c.estado_contrato });
    const i = infoOlt(c.olt, cat);
    salida.push({
      nombre: c.nombre || "", cuenta: c.cuenta || "", telefono_casa: c.tel_casa, telefono_oficina: c.tel_oficina, correo: c.correo, estado: c.estado, ciudad: c.ciudad, localidad: c.localidad,
      sector: c.sector, direccion: c.direccion, oficina: i.oficina || "", olt: i.codigo, tarjeta: c.tarjeta, puerto: c.puerto, estado_contrato: c.estado_contrato,
      veces_afectado: (tickets.get(c.k) || new Set()).size, ultima_actualizacion: c.fecha || "",
    });
  }
  salida.sort((a, b) => a.olt.localeCompare(b.olt) || (a.tarjeta ?? 0) - (b.tarjeta ?? 0) || (a.puerto ?? 0) - (b.puerto ?? 0) || a.nombre.localeCompare(b.nombre));
  const truncado = salida.length > MAX_CLIENTES;
  return { clientes: truncado ? salida.slice(0, MAX_CLIENTES) : salida, total: salida.length, truncado };
}

// Códigos canónicos de las OLTs de una oficina (para bajar el Excel de toda la oficina)
export async function oltsDeOficina(db, oficinaId) {
  const r = await nivelOlts(db, oficinaId);
  return r.olts.map((o) => o.canon);
}
export { canon as canonOlt, mapaEquivalencias };
