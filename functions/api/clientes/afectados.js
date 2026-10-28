import { json, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";
import { consultarClientes } from "../../_lib/consulta-clientes.js";

// GET /api/clientes/afectados?ticket=&oficina_id=&olt=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&tipos=falla,powerfail,caida_previa&activos=1&sin_cruzar=1
// Clientes afectados de las auditorías vigentes asociadas a tickets (administrador y supervisor).
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const q = new URL(request.url).searchParams;
  const r = await consultarClientes(env.DB, {
    ticket: q.get("ticket") || "", oficina_id: q.get("oficina_id") || "", olt: q.get("olt") || "",
    desde: q.get("desde") || "", hasta: q.get("hasta") || "",
    tipos: (q.get("tipos") || "").split(",").map((x) => x.trim()).filter(Boolean),
    activos: q.get("activos") === "1", sin_cruzar: q.get("sin_cruzar") === "1",
  });
  return json(r);
}
