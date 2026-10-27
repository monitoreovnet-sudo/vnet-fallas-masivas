import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { resumenAuditoria } from "../../../_lib/cruce.js";

// POST /api/clientes/auditoria/finalizar   Body: { auditoria_id }
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const { auditoria_id, esperadas } = await request.json();
  const aud = await env.DB.prepare("SELECT * FROM auditorias WHERE id = ?").bind(Number(auditoria_id)).first();
  if (!aud) return badRequest("La auditoría no existe.");
  const n = (await env.DB.prepare("SELECT COUNT(*) n FROM auditoria_onus WHERE auditoria_id = ?").bind(aud.id).first()).n;
  if (Number(esperadas) !== n) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM auditoria_onus WHERE auditoria_id = ?").bind(aud.id),
      env.DB.prepare("DELETE FROM auditorias WHERE id = ?").bind(aud.id),
    ]);
    return badRequest(`Llegaron ${n} de ${esperadas} ONUs. La auditoría se descartó; intenta de nuevo.`);
  }
  await env.DB.prepare("UPDATE auditorias SET total_onus = ? WHERE id = ?").bind(n, aud.id).run();
  return json({ ok: true, auditoria: { id: aud.id, olt: aud.olt_nombre, tarjeta: aud.tarjeta, puerto: aud.puerto, fecha_local: aud.fecha_auditoria_local }, resumen: await resumenAuditoria(env.DB, aud.id) });
}
