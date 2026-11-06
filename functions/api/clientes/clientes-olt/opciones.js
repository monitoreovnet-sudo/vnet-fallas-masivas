import { json, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { catalogo, infoOlt } from "../../../_lib/informe2.js";

// GET /api/clientes/clientes-olt/opciones -> valores para los filtros del informe «Clientes por OLT»
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const cat = await catalogo(env.DB);
  // Una sola lectura de la tabla (agrupada) para sacar los valores que existen
  const g = (await env.DB.prepare("SELECT sucursal, estado_geo, estado_onu, estado_contrato FROM clientes_olt GROUP BY sucursal, estado_geo, estado_onu, estado_contrato").all()).results;
  const set = (k) => [...new Set(g.map((x) => x[k]).filter((v) => v !== null && v !== undefined && v !== ""))].sort((a, b) => String(a).localeCompare(String(b)));
  const olts = (await env.DB.prepare("SELECT olt FROM olt_conteo WHERE n > 0").all()).results.map((r) => r.olt);
  const lista = new Map();
  for (const o of olts) { const i = infoOlt(o, cat); if (!lista.has(i.canon)) lista.set(i.canon, { olt: i.codigo, oficina_id: i.oficina_id }); }
  const oficinas = new Map();
  for (const o of lista.values()) if (o.oficina_id) { const i = [...cat.porCanon.values()].find((x) => x.oficina_id === o.oficina_id); if (i) oficinas.set(o.oficina_id, i.oficina); }
  return json({
    sucursales: set("sucursal"), estados: set("estado_geo"), estatus_olt: set("estado_onu"), estatus_grafana: set("estado_contrato"),
    oficinas: [...oficinas.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    olts: [...lista.values()].sort((a, b) => a.olt.localeCompare(b.olt)),
  });
}
