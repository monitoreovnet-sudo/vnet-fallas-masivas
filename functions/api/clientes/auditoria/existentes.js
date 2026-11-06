import { json, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// POST /api/clientes/auditoria/existentes   Body: { archivos: ["SmartOLT_oltid_…csv", …] }
// Devuelve cuáles de esos archivos ya están cargados como auditoría (mismo nombre de archivo, con ONUs guardadas).
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const nombres = [...new Set((Array.isArray(b.archivos) ? b.archivos : []).map((x) => String(x || "").slice(0, 250)).filter(Boolean))].slice(0, 1000);
  const ya = [];
  const stmts = [];
  for (let i = 0; i < nombres.length; i += 90) {
    const parte = nombres.slice(i, i + 90);
    stmts.push(env.DB.prepare(`SELECT archivo FROM auditorias WHERE total_onus > 0 AND archivo IN (${parte.map(() => "?").join(",")})`).bind(...parte));
  }
  if (stmts.length) (await env.DB.batch(stmts)).forEach((r) => r.results.forEach((x) => ya.push(x.archivo)));
  return json({ cargados: ya });
}
