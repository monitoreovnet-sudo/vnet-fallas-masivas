import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES, filaCliente, sqlInsertCliente } from "../../../_lib/clientes.js";
import { tablaDe, COLUMNAS_TABLA, TABLA_OK } from "../../../_lib/sucursal.js";

const MAX_LOTE = 500;
// Posiciones de filaCliente() = COLUMNAS_TABLA: 0 cuenta, 1 carga_id, ... (carga_id no cuenta como cambio)
const COLS = COLUMNAS_TABLA;

// POST /api/clientes/carga/lote   Body: { carga_id, filas: [ {cuenta, nombre, ...} ] }
// La base de cada sucursal vive en su propia tabla (llave = número de cuenta). Se REEMPLAZA con el archivo, pero solo se escribe lo que cambió (plan gratuito de D1):
//   * cuenta nueva                       -> se agrega
//   * misma cuenta, mismos datos         -> se salta (no cuesta escritura)
//   * misma cuenta, algún dato distinto  -> se actualiza (ONU nueva, teléfono, dirección, etc.)
// Respuesta: { nuevas, cambiadas, existentes, conflictos: [] }  (ya no hay conflictos entre sucursales: cada una tiene su tabla)
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const filas = Array.isArray(b.filas) ? b.filas : [];
  if (!filas.length) return badRequest("El lote viene vacío.");
  if (filas.length > MAX_LOTE) return badRequest(`El lote no puede pasar de ${MAX_LOTE} filas.`);
  const carga = await env.DB.prepare("SELECT id, sucursal, estado FROM cargas_base WHERE id = ?").bind(Number(b.carga_id)).first();
  if (!carga) return badRequest("La carga no existe.");
  if (carga.estado !== "cargando") return badRequest("Esta carga ya no admite más filas.");
  const tabla = await tablaDe(env.DB, carga.sucursal);
  if (!tabla || !TABLA_OK.test(tabla)) return badRequest("La sucursal no tiene tabla (¿falta aplicar la migración 047?).");

  const params = [];
  const vistas = new Set();
  for (const f of filas) {
    const p = filaCliente(f || {}, carga.id, carga.sucursal);
    if (!p || vistas.has(p[0])) continue;
    vistas.add(p[0]); params.push(p);
  }
  const existentes = new Map();
  const cuentas = params.map((p) => p[0]);
  const lecturas = [];
  for (let i = 0; i < cuentas.length; i += 90) {
    const parte = cuentas.slice(i, i + 90);
    lecturas.push(env.DB.prepare(`SELECT ${COLS.join(", ")} FROM ${tabla} WHERE cuenta IN (${parte.map(() => "?").join(",")})`).bind(...parte));
  }
  if (lecturas.length) (await env.DB.batch(lecturas)).forEach((r) => r.results.forEach((x) => existentes.set(x.cuenta, x)));

  let nuevas = 0, cambiadas = 0, iguales = 0;
  const stmts = [];
  const SQL = sqlInsertCliente(tabla);
  for (const p of params) {
    const previa = existentes.get(p[0]);
    if (!previa) { nuevas++; stmts.push(env.DB.prepare(SQL).bind(...p)); continue; }
    const igual = COLS.every((c, i) => i === 1 || (previa[c] ?? null) === (p[i] ?? null));
    if (igual) { iguales++; continue; }
    cambiadas++; stmts.push(env.DB.prepare(SQL).bind(...p));
  }
  // El avance se anota en la carga (aunque luego falle) para saber cuántos cambios se han escrito hoy
  if (stmts.length) {
    stmts.push(env.DB.prepare("UPDATE cargas_base SET nuevas = COALESCE(nuevas, 0) + ?, cambiadas = COALESCE(cambiadas, 0) + ? WHERE id = ?").bind(nuevas, cambiadas, carga.id));
    await env.DB.batch(stmts);
  }
  return json({ recibidas: filas.length, nuevas, cambiadas, existentes: iguales, conflictos: [] });
}
