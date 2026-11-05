import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { tablaDe, TABLA_OK } from "../../../_lib/sucursal.js";
import { cerrarCarga } from "../../../_lib/carga-grafana.js";

// POST /api/clientes/carga/finalizar
// Body: { carga_id, nuevas, cambiadas, existentes, completa, claves (números de cuenta), claves_tipo: "cuenta", confirmar_bajas }
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

  const tabla = await tablaDe(db, c.sucursal);
  if (!tabla || !TABLA_OK.test(tabla)) return badRequest("La sucursal no tiene tabla (¿falta aplicar la migración 047?).");
  let cuentas = null;
  // Solo se dan de baja clientes si la lista viene como números de cuenta (una página vieja mandaba seriales y borraría todo)
  if (b.completa === true && Array.isArray(b.claves) && b.claves_tipo === "cuenta") {
    if (b.claves.length > 400000) return badRequest("La lista de llaves es demasiado grande.");
    cuentas = b.claves;
  }
  const r = await cerrarCarga(db, c, tabla, { nuevas, cambiadas, existentes, completa: b.completa === true, cuentas, confirmar: b.confirmar_bajas === true });
  return json(r);
}
