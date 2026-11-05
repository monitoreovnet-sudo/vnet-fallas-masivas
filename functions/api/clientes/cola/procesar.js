import { json, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { tablaDe, TABLA_OK } from "../../../_lib/sucursal.js";
import { aplicarLote, cerrarCarga, gunzipJson } from "../../../_lib/carga-grafana.js";
import { esTokenCron } from "../../../_lib/cron.js";
import { presupuestoNoche, TOPE_NOCHE } from "../../../_lib/cola-noche.js";

// POST /api/clientes/cola/procesar
// Hace UNA unidad de trabajo por llamada (un trozo de filas, o el cierre con las bajas) y dice si hay que volver a llamar.
// Entra el cron nocturno (Authorization: Bearer <CRON_TOKEN>) o un administrador/supervisor con sesión ("Procesar ahora").
// Respuesta: { seguir, motivo, carga_id, sucursal, hecho, sig, total_chunks, cambios, cupo }
//   motivo: "ok" | "sin_cola" | "sin_cupo" | "espera_confirmacion" | "terminada" | "descartada"
const upsertUso = (db, origen, n) =>
  db.prepare("INSERT INTO uso_d1 (dia, origen, filas) VALUES (date('now'), ?, ?) ON CONFLICT(dia, origen) DO UPDATE SET filas = filas + excluded.filas").bind(origen, n);

export async function onRequestPost({ request, env }) {
  if (!esTokenCron(request, env)) {
    const no = await requireRole(env.DB, request, ROLES_CLIENTES);
    if (no) return no;
  }
  const db = env.DB;
  const q = await db.prepare(
    `SELECT q.*, c.sucursal, c.fecha_base, c.estado AS cestado FROM cola_cargas q JOIN cargas_base c ON c.id = q.carga_id
      WHERE q.estado = 'pendiente' ORDER BY q.carga_id LIMIT 1`).first();
  if (!q) return json({ seguir: false, motivo: "sin_cola" });
  const base = { carga_id: q.carga_id, sucursal: q.sucursal, total_chunks: q.total_chunks };

  // La carga fue reemplazada por otra subida directa o cancelada: se descarta
  if (q.cestado !== "cargando") {
    await db.batch([
      db.prepare("UPDATE cola_cargas SET estado = 'error', error = ?, actualizado = datetime('now') WHERE carga_id = ?").bind("La carga ya no estaba activa (se subió otra de la sucursal o se canceló).", q.carga_id),
      db.prepare("DELETE FROM cola_grafana WHERE carga_id = ?").bind(q.carga_id),
    ]);
    return json({ ...base, seguir: true, motivo: "descartada", sig: q.sig });
  }
  const tabla = await tablaDe(db, q.sucursal);
  if (!tabla || !TABLA_OK.test(tabla)) {
    await db.prepare("UPDATE cola_cargas SET estado = 'error', error = 'La sucursal no tiene tabla (falta la migración 047).', actualizado = datetime('now') WHERE carga_id = ?").bind(q.carga_id).run();
    return json({ ...base, seguir: true, motivo: "descartada", sig: q.sig });
  }
  const p = await presupuestoNoche(db);
  const cupo = { usado_noche: p.usadoNoche, tope_noche: TOPE_NOCHE, quedan: p.restante };
  if (p.restante <= 0) return json({ ...base, seguir: false, motivo: "sin_cupo", sig: q.sig, cupo });

  const carga = { id: q.carga_id, sucursal: q.sucursal, fecha_base: q.fecha_base };

  // 1) Un trozo de filas
  if (q.sig < q.total_chunks) {
    const t = await db.prepare("SELECT datos FROM cola_grafana WHERE carga_id = ? AND tipo = 'filas' AND seq = ?").bind(q.carga_id, q.sig).first();
    if (!t) {
      await db.prepare("UPDATE cola_cargas SET estado = 'error', error = ?, actualizado = datetime('now') WHERE carga_id = ?").bind(`Falta el trozo ${q.sig} de la cola.`, q.carga_id).run();
      return json({ ...base, seguir: true, motivo: "descartada", sig: q.sig });
    }
    const filas = await gunzipJson(t.datos);
    const r = await aplicarLote(db, carga, tabla, filas, {
      contar: false,
      extra: (res) => {
        const cambios = res.nuevas + res.cambiadas;
        const s = [
          db.prepare(`UPDATE cola_cargas SET sig = sig + 1, nuevas = nuevas + ?, cambiadas = cambiadas + ?, existentes = existentes + ?, actualizado = datetime('now')
                       WHERE carga_id = ? AND sig = ?`).bind(res.nuevas, res.cambiadas, res.existentes, q.carga_id, q.sig),
          db.prepare("DELETE FROM cola_grafana WHERE carga_id = ? AND tipo = 'filas' AND seq = ?").bind(q.carga_id, q.sig),
        ];
        if (cambios > 0) s.push(upsertUso(db, "cola_noche", cambios));
        return s;
      },
    });
    return json({ ...base, seguir: true, motivo: "ok", hecho: "trozo", sig: q.sig + 1, cambios: r.nuevas + r.cambiadas, cupo: { ...cupo, quedan: Math.max(0, p.restante - r.nuevas - r.cambiadas) } });
  }

  // 2) Cierre: bajas (si el archivo estaba completo) y la carga pasa a ser la vigente de la sucursal
  let cuentas = null;
  if (q.completa) {
    cuentas = [];
    const ts = (await db.prepare("SELECT datos FROM cola_grafana WHERE carga_id = ? AND tipo = 'cuentas' ORDER BY seq").bind(q.carga_id).all()).results;
    for (const t of ts) cuentas.push(...(await gunzipJson(t.datos)));
  }
  const r = await cerrarCarga(db, carga, tabla,
    { nuevas: q.nuevas, cambiadas: q.cambiadas, existentes: q.existentes, completa: !!q.completa, cuentas, confirmar: !!q.confirmar },
    {
      extraFinal: (bajas, total) => {
        const s = [
          db.prepare("UPDATE cola_cargas SET estado = 'lista', bajas = ?, total_base = ?, actualizado = datetime('now') WHERE carga_id = ?").bind(bajas, total, q.carga_id),
          db.prepare("DELETE FROM cola_grafana WHERE carga_id = ?").bind(q.carga_id),
        ];
        if (bajas > 0) s.push(upsertUso(db, "cola_noche", bajas));
        return s;
      },
    });
  if (r.requiere_confirmacion) {
    await db.prepare("UPDATE cola_cargas SET estado = 'espera_confirmacion', bajas = ?, total_base = ?, confirmar = 0, actualizado = datetime('now') WHERE carga_id = ?").bind(r.bajas, r.total, q.carga_id).run();
    return json({ ...base, seguir: true, motivo: "espera_confirmacion", bajas: r.bajas, total: r.total, sig: q.sig, cupo });
  }
  return json({ ...base, seguir: true, motivo: "terminada", hecho: "cierre", sig: q.sig, bajas: r.bajas, filas: r.filas, cupo });
}
