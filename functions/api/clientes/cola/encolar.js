import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { registrarUso, escrituras } from "../../../_lib/uso-d1.js";

// POST /api/clientes/cola/encolar   Body: { carga_id, total_chunks, cuentas_chunks, completa, filas }
// Cierra la subida: verifica que estén todos los trozos y deja la carga lista para procesarse (de noche o con "Procesar ahora").
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const db = env.DB;
  const id = Number(b.carga_id);
  const total = Number(b.total_chunks), cuentas = Number(b.cuentas_chunks || 0), filas = Number(b.filas || 0);
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(cuentas) || cuentas < 0) return badRequest("Datos de la cola no válidos.");
  const q = await db.prepare("SELECT estado FROM cola_cargas WHERE carga_id = ?").bind(id).first();
  if (!q || q.estado !== "subiendo") return badRequest("La cola de esta carga no está abierta.");
  const r = await db.prepare(
    "SELECT tipo, COUNT(*) AS n, MIN(seq) AS mn, MAX(seq) AS mx FROM cola_grafana WHERE carga_id = ? GROUP BY tipo").bind(id).all();
  const por = Object.fromEntries(r.results.map((x) => [x.tipo, x]));
  const ok = (t, esperado) => esperado === 0 ? !por[t] : por[t] && por[t].n === esperado && por[t].mn === 0 && por[t].mx === esperado - 1;
  if (!ok("filas", total) || !ok("cuentas", cuentas)) return badRequest("Faltan trozos por subir. Vuelve a intentarlo.");
  const completa = b.completa === true && cuentas > 0 ? 1 : 0;
  const w = await db.prepare(
    "UPDATE cola_cargas SET estado = 'pendiente', total_chunks = ?, cuentas_chunks = ?, completa = ?, filas = ?, actualizado = datetime('now') WHERE carga_id = ? AND estado = 'subiendo'")
    .bind(total, cuentas, completa, filas, id).run();
  await registrarUso(db, "cola_subida", escrituras(w));
  return json({ ok: true });
}
