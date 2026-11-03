import { json, badRequest, requireRole } from "../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../_lib/clientes.js";
import { nivelOficinas, nivelOlts, nivelClientes, oltsDeOficina, canonOlt, mapaEquivalencias } from "../../_lib/informe2.js";

// GET /api/clientes/informe2?nivel=oficinas
// GET /api/clientes/informe2?nivel=olts&oficina_id=<id|sin>
// GET /api/clientes/informe2?nivel=clientes&olt=<código>      (una OLT)
// GET /api/clientes/informe2?nivel=clientes&oficina_id=<id|sin> (todas las OLTs de la oficina, para el Excel)
// Reporte general de clientes conocidos (administrador y supervisor).
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const q = new URL(request.url).searchParams;
  const nivel = q.get("nivel") || "oficinas";
  if (nivel === "oficinas") return json(await nivelOficinas(env.DB));
  if (nivel === "olts") {
    const id = q.get("oficina_id") || "";
    if (!/^(\d+|sin)$/.test(id)) return badRequest("Indica la oficina.");
    return json(await nivelOlts(env.DB, id));
  }
  if (nivel === "clientes") {
    const olt = (q.get("olt") || "").trim().toUpperCase(), of = q.get("oficina_id") || "";
    if (olt) {
      const eq = await mapaEquivalencias(env.DB);
      return json(await nivelClientes(env.DB, [canonOlt(olt, eq) || olt]));
    }
    if (/^(\d+|sin)$/.test(of)) return json(await nivelClientes(env.DB, await oltsDeOficina(env.DB, of)));
    return badRequest("Indica la OLT o la oficina.");
  }
  return badRequest("Nivel no válido.");
}
