import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/carga/finalizar
// Body: { carga_id, nuevas, cambiadas, existentes, completa, claves, confirmar_bajas }
// Cierra la carga: queda como la vigente de su sucursal. Si la carga está completa (se leyó todo el archivo) y trae la lista de llaves,
// los clientes de esa sucursal que YA NO vienen como Activos se dan de baja (la base de la sucursal queda igual al archivo).
// Protección: si las bajas pasan del 30 % de la base (mín. 500) se pide confirmación antes de borrar (archivo incompleto o equivocado).
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const db = env.DB;
  const c = await db.prepare("SELECT * FROM cargas_base WHERE id = ?").bind(Number(b.carga_id)).first();
  if (!c) return badRequest("La carga no existe.");
  if (c.estado !== "cargando") return badRequest("Esta carga ya fue cerrada.");
  const n = (v) => { const x = Number(v); return Number.isInteger(x) && x >= 0 ? x : 0; };
  const nuevas = n(b.nuevas), cambiadas = n(b.cambiadas), existentes = n(b.existentes);

  let bajas = 0;
  if (b.completa === true && Array.isArray(b.claves)) {
    if (b.claves.length > 400000) return badRequest("La lista de llaves es demasiado grande.");
    const enArchivo = new Set(b.claves.map(String));
    const enBase = (await db.prepare("SELECT clave FROM clientes_base WHERE sucursal = ?").bind(c.sucursal).all()).results.map((r) => r.clave);
    const sobran = enBase.filter((k) => !enArchivo.has(k));
    if (sobran.length > Math.max(500, Math.floor(enBase.length * 0.3)) && b.confirmar_bajas !== true) {
      return json({ requiere_confirmacion: true, bajas: sobran.length, total: enBase.length });
    }
    for (let i = 0; i < sobran.length; i += 90 * 20) {
      const stmts = [];
      for (let j = i; j < Math.min(sobran.length, i + 90 * 20); j += 90) {
        const parte = sobran.slice(j, j + 90);
        stmts.push(db.prepare(`DELETE FROM clientes_base WHERE sucursal = ? AND clave IN (${parte.map(() => "?").join(",")})`).bind(c.sucursal, ...parte));
      }
      await db.batch(stmts);
    }
    bajas = sobran.length;
  }
  const total = (await db.prepare("SELECT COUNT(*) AS n FROM clientes_base WHERE sucursal = ?").bind(c.sucursal).first()).n;
  await db.batch([
    db.prepare("UPDATE cargas_base SET estado = 'reemplazada' WHERE sucursal = ? AND estado = 'vigente'").bind(c.sucursal),
    db.prepare("UPDATE cargas_base SET estado = 'vigente', nuevas = ?, cambiadas = ?, existentes = ?, bajas = ?, total_acum = ?, activos = ? WHERE id = ?")
      .bind(nuevas, cambiadas, existentes, bajas, total, total, c.id),
  ]);
  return json({ ok: true, sucursal: c.sucursal, fecha_base: c.fecha_base, nuevas, cambiadas, existentes, bajas, filas: total, activos: total });
}
