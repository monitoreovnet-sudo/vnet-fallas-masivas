import { json, badRequest, requireAdmin, nowIso } from "../../_lib/helpers.js";
import { asegurarTablaConfig, sanearConfigReporte, REPORTES_VALIDOS } from "../../_lib/config-reportes.js";
import { clavesPermitidas } from "../../_lib/campos-reportes.js";

// PUT /api/admin/config-reportes   Body: { reporte: "piz"|"rep", config: { columnas: [...] } }
export async function onRequestPut({ request, env }) {
  const admin = await requireAdmin(request, env);
  const body = await request.json().catch(() => ({}));
  if (!REPORTES_VALIDOS.includes(body.reporte)) return badRequest("Informe inválido.");
  const { config, error } = sanearConfigReporte(body.config, await clavesPermitidas(env.DB));
  if (error) return badRequest(error);
  await asegurarTablaConfig(env.DB);
  await env.DB.prepare(
    `INSERT INTO config_reportes (reporte, config, actualizado_por, actualizado_en) VALUES (?, ?, ?, ?)
     ON CONFLICT(reporte) DO UPDATE SET config = excluded.config, actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en`
  ).bind(body.reporte, JSON.stringify(config), admin?.email ?? null, nowIso()).run();
  return json({ ok: true, config });
}

// DELETE /api/admin/config-reportes?reporte=piz   → vuelve a la configuración de fábrica
export async function onRequestDelete({ request, env }) {
  await requireAdmin(request, env);
  const reporte = new URL(request.url).searchParams.get("reporte");
  if (!REPORTES_VALIDOS.includes(reporte)) return badRequest("Informe inválido.");
  await asegurarTablaConfig(env.DB);
  await env.DB.prepare("DELETE FROM config_reportes WHERE reporte = ?").bind(reporte).run();
  return json({ ok: true });
}
