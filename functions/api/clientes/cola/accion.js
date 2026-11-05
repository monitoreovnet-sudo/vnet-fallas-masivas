import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/cola/accion   Body: { carga_id, accion: "confirmar" | "cancelar" }
//   confirmar: autoriza las bajas que estaban esperando confirmación (se aplican en la siguiente corrida)
//   cancelar : descarta la carga completa (la base de la sucursal queda como estaba, salvo lo ya escrito) y borra los trozos guardados
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const db = env.DB, id = Number(b.carga_id);
  const q = await db.prepare("SELECT estado FROM cola_cargas WHERE carga_id = ?").bind(id).first();
  if (!q) return badRequest("Esa carga no está en la cola.");
  if (b.accion === "confirmar") {
    if (q.estado !== "espera_confirmacion") return badRequest("Esta carga no está esperando confirmación.");
    await db.prepare("UPDATE cola_cargas SET estado = 'pendiente', confirmar = 1, actualizado = datetime('now') WHERE carga_id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (b.accion === "cancelar") {
    if (!["subiendo", "pendiente", "espera_confirmacion"].includes(q.estado)) return badRequest("Esta carga ya terminó.");
    await db.batch([
      db.prepare("UPDATE cola_cargas SET estado = 'cancelada', actualizado = datetime('now') WHERE carga_id = ?").bind(id),
      db.prepare("UPDATE cargas_base SET estado = 'fallida' WHERE id = ? AND estado = 'cargando'").bind(id),
      db.prepare("DELETE FROM cola_grafana WHERE carga_id = ?").bind(id),
    ]);
    return json({ ok: true });
  }
  return badRequest("Acción no válida.");
}
