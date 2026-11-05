import { json, badRequest, requireRole, currentUserEmail } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { registrarUso, escrituras } from "../../../_lib/uso-d1.js";

const MAX_CHARS = 1500000;   // un trozo comprimido pesa unos 30 KB; esto es solo una protección

// POST /api/clientes/cola/subir
//   { carga_id, abrir: true }                          -> abre la cola de esa carga (la carga debe estar "cargando")
//   { carga_id, tipo: "filas"|"cuentas", seq, n, datos } -> guarda un trozo (JSON comprimido con gzip, en base64)
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const db = env.DB;
  const id = Number(b.carga_id);
  const c = await db.prepare("SELECT id, estado FROM cargas_base WHERE id = ?").bind(id).first();
  if (!c) return badRequest("La carga no existe.");
  if (c.estado !== "cargando") return badRequest("Esta carga ya no admite más datos.");
  if (b.abrir === true) {
    const rs = await db.batch([
      db.prepare("INSERT OR IGNORE INTO cola_cargas (carga_id, estado, usuario) VALUES (?, 'subiendo', ?)").bind(id, currentUserEmail(request)),
      db.prepare("UPDATE cargas_base SET en_cola = 1 WHERE id = ?").bind(id),
    ]);
    await registrarUso(db, "cola_subida", escrituras(rs));
    return json({ ok: true });
  }
  const q = await db.prepare("SELECT estado FROM cola_cargas WHERE carga_id = ?").bind(id).first();
  if (!q || q.estado !== "subiendo") return badRequest("La cola de esta carga no está abierta.");
  const tipo = b.tipo === "cuentas" ? "cuentas" : b.tipo === "filas" ? "filas" : null;
  const seq = Number(b.seq), n = Number(b.n);
  if (!tipo || !Number.isInteger(seq) || seq < 0 || !Number.isInteger(n) || n < 1) return badRequest("Trozo no válido.");
  if (typeof b.datos !== "string" || !b.datos.length || b.datos.length > MAX_CHARS) return badRequest("El trozo viene vacío o es demasiado grande.");
  const r = await db.prepare("INSERT OR REPLACE INTO cola_grafana (carga_id, tipo, seq, n, datos) VALUES (?, ?, ?, ?, ?)").bind(id, tipo, seq, n, b.datos).run();
  await registrarUso(db, "cola_subida", escrituras(r));
  return json({ ok: true });
}
