// Lógica compartida de la carga de Grafana: la usan la carga directa (carga/lote, carga/finalizar) y la cola nocturna (cola/procesar).
import { filaCliente, sqlInsertCliente, cuentaCliente } from "./clientes.js";
import { COLUMNAS_TABLA } from "./sucursal.js";

const COLS = COLUMNAS_TABLA;

// Aplica un lote de filas a la tabla de la sucursal: solo escribe lo nuevo o cambiado.
// opts.contar (por defecto true): anota nuevas/cambiadas en cargas_base (carga directa).
// opts.extra(res): sentencias adicionales que se ejecutan en el MISMO batch (atómico), p. ej. el avance de la cola.
export async function aplicarLote(db, carga, tabla, filas, opts = {}) {
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
    lecturas.push(db.prepare(`SELECT ${COLS.join(", ")} FROM ${tabla} WHERE cuenta IN (${parte.map(() => "?").join(",")})`).bind(...parte));
  }
  if (lecturas.length) (await db.batch(lecturas)).forEach((r) => r.results.forEach((x) => existentes.set(x.cuenta, x)));

  let nuevas = 0, cambiadas = 0, iguales = 0;
  const stmts = [];
  const SQL = sqlInsertCliente(tabla);
  for (const p of params) {
    const previa = existentes.get(p[0]);
    if (!previa) { nuevas++; stmts.push(db.prepare(SQL).bind(...p)); continue; }
    const igual = COLS.every((c, i) => i === 1 || (previa[c] ?? null) === (p[i] ?? null));
    if (igual) { iguales++; continue; }
    cambiadas++; stmts.push(db.prepare(SQL).bind(...p));
  }
  const res = { recibidas: filas.length, nuevas, cambiadas, existentes: iguales };
  if (stmts.length && opts.contar !== false) {
    stmts.push(db.prepare("UPDATE cargas_base SET nuevas = COALESCE(nuevas, 0) + ?, cambiadas = COALESCE(cambiadas, 0) + ? WHERE id = ?").bind(nuevas, cambiadas, carga.id));
  }
  if (opts.extra) stmts.push(...opts.extra(res));
  if (stmts.length) await db.batch(stmts);
  return res;
}

// Cierra la carga: aplica las bajas (si la carga está completa y trae las cuentas) y deja la carga como la vigente de su sucursal.
// Devuelve { requiere_confirmacion, bajas, total } si las bajas pasan del 30 % (mín. 500) y no se confirmó.
// opts.extraFinal(bajas): sentencias adicionales para el batch final.
export async function cerrarCarga(db, c, tabla, { nuevas = 0, cambiadas = 0, existentes = 0, completa = false, cuentas = null, confirmar = false }, opts = {}) {
  let bajas = 0;
  if (completa === true && Array.isArray(cuentas)) {
    const enArchivo = new Set(cuentas.map(cuentaCliente));
    const enBase = (await db.prepare(`SELECT cuenta FROM ${tabla}`).all()).results.map((r) => r.cuenta);
    const sobran = enBase.filter((k) => !enArchivo.has(k));
    if (sobran.length > Math.max(500, Math.floor(enBase.length * 0.3)) && confirmar !== true) {
      return { requiere_confirmacion: true, bajas: sobran.length, total: enBase.length };
    }
    for (let i = 0; i < sobran.length; i += 90 * 20) {
      const stmts = [];
      for (let j = i; j < Math.min(sobran.length, i + 90 * 20); j += 90) {
        const parte = sobran.slice(j, j + 90);
        stmts.push(db.prepare(`DELETE FROM ${tabla} WHERE cuenta IN (${parte.map(() => "?").join(",")})`).bind(...parte));
      }
      await db.batch(stmts);
    }
    bajas = sobran.length;
  }
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).first()).n;
  const fin = [
    db.prepare("UPDATE sucursal_tablas SET listo = 1 WHERE sucursal = ?").bind(c.sucursal),
    db.prepare("UPDATE cargas_base SET estado = 'reemplazada' WHERE sucursal = ? AND estado = 'vigente'").bind(c.sucursal),
    db.prepare("UPDATE cargas_base SET estado = 'vigente', nuevas = ?, cambiadas = ?, existentes = ?, bajas = ?, total_acum = ?, activos = ? WHERE id = ?")
      .bind(nuevas, cambiadas, existentes, bajas, total, total, c.id),
  ];
  if (opts.extraFinal) fin.push(...opts.extraFinal(bajas, total));
  await db.batch(fin);
  return { ok: true, sucursal: c.sucursal, fecha_base: c.fecha_base, nuevas, cambiadas, existentes, bajas, filas: total, activos: total };
}

// Trozos comprimidos (gzip + base64) para guardar en D1 y leer en el Worker
export async function gunzipJson(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const texto = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(texto);
}
