// Una tabla de clientes por sucursal (cb_<sucursal>, llave = cuenta) y la sucursal de cada OLT (tabla olt_sucursal).
// El cruce con SmartOLT busca solo en la tabla de la sucursal de la OLT: lee unas decenas de miles de filas en vez de toda la base.
// Mientras una sucursal no se haya vuelto a cargar en su tabla nueva, se sigue usando la tabla vieja (clientes_base) para ella.
import { mapaEquivalencias, canon } from "./asociacion.js";

export const normSuc = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const nombreTabla = (suc) => "cb_" + (normSuc(suc).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x");
export const TABLA_OK = /^cb_[a-z0-9_]{1,60}$/;

export const COLUMNAS_TABLA = ["cuenta", "carga_id", "estado_contrato", "fecha_creacion", "sucursal", "cedula", "cedula_norm", "tipo_cliente",
  "nombre", "nombre_norm", "genero", "telefono_casa", "telefono_oficina", "correo", "correo_iptv", "serial_onu", "serial_norm",
  "estado_geo", "direccion", "municipio", "parroquia", "sector", "sector_norm", "plan"];

const SQL_CREAR = (t) => `CREATE TABLE IF NOT EXISTS ${t} (
  cuenta TEXT PRIMARY KEY, carga_id INTEGER, estado_contrato TEXT, fecha_creacion TEXT, sucursal TEXT NOT NULL, cedula TEXT, cedula_norm TEXT, tipo_cliente TEXT,
  nombre TEXT, nombre_norm TEXT, genero TEXT, telefono_casa TEXT, telefono_oficina TEXT, correo TEXT, correo_iptv TEXT, serial_onu TEXT, serial_norm TEXT,
  estado_geo TEXT, direccion TEXT, municipio TEXT, parroquia TEXT, sector TEXT, sector_norm TEXT, plan TEXT) WITHOUT ROWID`;

// Devuelve el nombre de la tabla de la sucursal (la crea si no existe)
export async function asegurarTabla(db, sucursal) {
  const ya = await db.prepare("SELECT tabla FROM sucursal_tablas WHERE sucursal = ?").bind(sucursal).first();
  if (ya) return ya.tabla;
  let t = nombreTabla(sucursal);
  const choque = await db.prepare("SELECT sucursal FROM sucursal_tablas WHERE tabla = ?").bind(t).first();
  if (choque) t = t + "_" + ((await db.prepare("SELECT COUNT(*) AS n FROM sucursal_tablas").first()).n + 1);
  await db.prepare(SQL_CREAR(t)).run();
  await db.prepare("INSERT OR IGNORE INTO sucursal_tablas (sucursal, tabla, listo, creado) VALUES (?, ?, 0, datetime('now', '-4 hours'))").bind(sucursal, t).run();
  return t;
}
export async function tablaDe(db, sucursal) {
  const r = await db.prepare("SELECT tabla FROM sucursal_tablas WHERE sucursal = ?").bind(sucursal).first();
  return r ? r.tabla : null;
}

// { sucursalesDe(olt) -> nombres de sucursal de la OLT (tal como están en las cargas), tablas: Map(sucursal -> tabla ya cargada), vieja: ¿existe clientes_base?, vigentes, sinBase }
export async function contextoSucursales(db) {
  const eq = await mapaEquivalencias(db);
  const vigentes = (await db.prepare("SELECT sucursal, COALESCE(total_acum, activos, 0) AS total FROM cargas_base WHERE estado = 'vigente' ORDER BY sucursal").all()).results;
  const real = new Map(vigentes.map((v) => [normSuc(v.sucursal), v.sucursal]));
  const porOlt = new Map(), sinBase = new Set();
  try {
    for (const r of (await db.prepare("SELECT olt, sucursal FROM olt_sucursal").all()).results) {
      const c = canon(r.olt, eq) || String(r.olt).toUpperCase();
      const nom = real.get(normSuc(r.sucursal));
      if (!nom) { sinBase.add(r.sucursal); continue; }
      if (!porOlt.has(c)) porOlt.set(c, new Set());
      porOlt.get(c).add(nom);
    }
  } catch (e) { /* falta la migración 045 */ }
  const tablas = new Map();
  try { (await db.prepare("SELECT sucursal, tabla FROM sucursal_tablas WHERE listo = 1").all()).results.forEach((r) => { if (TABLA_OK.test(r.tabla)) tablas.set(r.sucursal, r.tabla); }); } catch (e) { /* falta la 047 */ }
  let vieja = true;
  try { vieja = !!(await db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'clientes_base'").first()); } catch (e) { /* nada */ }
  return { vigentes, tablas, vieja, sinBase: [...sinBase],
    sucursalesDe: (olt) => [...(porOlt.get(canon(olt, eq) || String(olt || "").trim().toUpperCase()) || [])] };
}
