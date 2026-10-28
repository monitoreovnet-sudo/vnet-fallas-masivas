import { json, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";

// GET /api/clientes/alertas?estado=abierta|cubierta|descartada|todas  -> alertas de "Posible falla no reportada"
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const estado = new URL(request.url).searchParams.get("estado") || "abierta";
  const filtro = ["abierta", "cubierta", "descartada"].includes(estado) ? "WHERE al.estado = ?" : "";
  const st = env.DB.prepare(
    `SELECT al.id, al.auditoria_id, al.olt, al.tarjeta, al.puerto, al.n_onus, al.estado, al.ticket_id, t.ticket_cmr, al.comentario, al.fecha, al.resuelto_por,
            a.fecha_auditoria_local
       FROM alertas_no_reportadas al JOIN auditorias a ON a.id = al.auditoria_id LEFT JOIN tickets t ON t.id = al.ticket_id
       ${filtro} ORDER BY al.id DESC LIMIT 200`);
  const { results } = await (filtro ? st.bind(estado) : st).all();
  return json({ alertas: results });
}
