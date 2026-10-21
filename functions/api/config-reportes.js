import { json } from "../_lib/helpers.js";
import { asegurarTablaConfig } from "../_lib/config-reportes.js";

// GET /api/config-reportes  (cualquier usuario con sesión)
// → { piz: {version, columnas:[…]} | null, rep: … | null }   (null = usar la configuración por defecto)
export async function onRequestGet({ env }) {
  await asegurarTablaConfig(env.DB);
  const { results } = await env.DB.prepare("SELECT reporte, config FROM config_reportes").all();
  const salida = { piz: null, rep: null, cic: null };
  for (const r of results) {
    try { salida[r.reporte] = JSON.parse(r.config); } catch { /* configuración dañada: se ignora y se usa la de fábrica */ }
  }
  return json(salida);
}
