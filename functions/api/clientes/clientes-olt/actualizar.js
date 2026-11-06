import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { TABLA_OK } from "../../../_lib/sucursal.js";
import { registrarUso, escrituras, lecturas, revisarCupo } from "../../../_lib/uso-d1.js";

const TANDA = 150;
const FUERA = "Fuera de la base activa";
const trozos = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
const CAMPOS = [["nombre", "nombre"], ["telefono_casa", "telefono_casa"], ["telefono_oficina", "telefono_oficina"], ["correo", "correo"], ["sector", "sector"], ["direccion", "direccion"],
  ["municipio", "municipio"], ["parroquia", "parroquia"], ["cedula", "cedula"], ["estado_geo", "estado_geo"], ["estado_contrato", "estado_contrato"]];

// POST /api/clientes/clientes-olt/actualizar   Body: { desde }
// Pone al día los datos de cada cliente del informe con la base de Grafana de su sucursal (por número de cuenta). Solo escribe lo que cambió.
// Si la cuenta ya no está en la base activa de su sucursal, el estatus de Grafana pasa a «Fuera de la base activa».
// Devuelve { procesadas, actualizadas, siguiente } (siguiente = valor de "desde" para la tanda que sigue; null = terminó).
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json().catch(() => ({}));
  const db = env.DB, desde = Math.max(0, Number(b.desde) || 0);
  { const sin = await revisarCupo(db); if (sin) return json(sin, 429); }
  let filas;
  try {
    filas = await db.prepare(`SELECT rowid AS rid, cuenta, sucursal, ${CAMPOS.map(([c]) => c).join(", ")} FROM clientes_olt WHERE rowid > ? ORDER BY rowid LIMIT ${TANDA}`).bind(desde).all();
  } catch (e) { return badRequest("Falta aplicar la migración 049 (informe Clientes por OLT)."); }
  let leidas = lecturas(filas);
  const lista = filas.results;
  if (!lista.length) return json({ procesadas: 0, actualizadas: 0, siguiente: null });
  const tablas = new Map();
  (await db.prepare("SELECT sucursal, tabla FROM sucursal_tablas WHERE listo = 1").all()).results.forEach((r) => { if (TABLA_OK.test(r.tabla)) tablas.set(r.sucursal, r.tabla); });
  const porTabla = new Map();
  for (const f of lista) { const t = tablas.get(f.sucursal); if (t && f.cuenta) { if (!porTabla.has(t)) porTabla.set(t, []); porTabla.get(t).push(f.cuenta); } }
  const lec = [];
  for (const [t, cuentas] of porTabla) for (const p of trozos([...new Set(cuentas)], 90)) lec.push([t, db.prepare(`SELECT cuenta, ${CAMPOS.map(([, g]) => g).join(", ")} FROM ${t} WHERE cuenta IN (${p.map(() => "?").join(",")})`).bind(...p)]);
  const grafana = new Map();
  if (lec.length) { const rs = await db.batch(lec.map((x) => x[1])); leidas += lecturas(rs); rs.forEach((r, i) => r.results.forEach((g) => grafana.set(lec[i][0] + "|" + g.cuenta, g))); }
  const stmts = [];
  for (const f of lista) {
    const t = tablas.get(f.sucursal);
    if (!t || !f.cuenta) continue;                       // la sucursal aún no está en su tabla nueva: se deja como está
    const g = grafana.get(t + "|" + f.cuenta);
    const nuevo = g ? Object.fromEntries(CAMPOS.map(([c, gc]) => [c, c === "estado_geo" ? (g[gc] || "") : (g[gc] ?? null)])) : { estado_contrato: FUERA };
    const cambios = Object.entries(nuevo).filter(([c, v]) => (f[c] ?? null) !== (v ?? null));
    if (!cambios.length) continue;
    stmts.push(db.prepare(`UPDATE clientes_olt SET ${cambios.map(([c]) => c + " = ?").join(", ")} WHERE rowid = ?`).bind(...cambios.map(([, v]) => v), f.rid));
  }
  let esc = 0;
  for (const p of trozos(stmts, 90)) esc += escrituras(await db.batch(p));
  await registrarUso(db, "mapa", esc);
  await registrarUso(db, "lect_mapa", leidas);
  return json({ procesadas: lista.length, actualizadas: stmts.length, siguiente: lista.length === TANDA ? lista[lista.length - 1].rid : null });
}
