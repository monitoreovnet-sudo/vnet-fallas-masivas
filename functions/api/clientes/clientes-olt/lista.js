import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { catalogo, infoOlt, variantes, canonOlt } from "../../../_lib/informe2.js";
import { registrarUso, lecturas } from "../../../_lib/uso-d1.js";

const MAX = 1000;

// GET /api/clientes/clientes-olt/lista?sucursal=A,B&estado=…&oficina_id=1,2&olt=…&estatus_olt=…&estatus_grafana=…&desde=<n>
// Informe «Clientes por OLT»: un cliente por ONU conocida (cruce Grafana × SmartOLT). Se lee por tandas de hasta 1.000 filas;
// "siguiente" es el valor de "desde" para pedir la tanda que sigue (null = no hay más). Cada filtro admite varios valores separados por coma.
export async function onRequestGet({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const q = new URL(request.url).searchParams;
  const valores = (k) => [...new Set((q.get(k) || "").split(",").map((v) => v.trim()).filter(Boolean))].slice(0, 300);
  const desde = Math.max(0, Number(q.get("desde")) || 0);
  const cat = await catalogo(env.DB);
  const where = ["rowid > ?"], params = [desde];
  const enLista = (col, vals, tipo) => { where.push(`${col} IN (SELECT value FROM json_each(?))`); params.push(JSON.stringify(vals)); };
  const suc = valores("sucursal"), est = valores("estado"), eo = valores("estatus_olt"), eg = valores("estatus_grafana");
  if (suc.length) enLista("sucursal", suc);
  if (est.length) enLista("estado_geo", est);
  if (eo.length) enLista("estado_onu", eo);
  if (eg.length) enLista("estado_contrato", eg);
  // OLT / oficina: se expanden a todos los nombres equivalentes (CRC = CRP)
  const olts = valores("olt"), ofis = valores("oficina_id");
  let nombres = null;
  const expandir = (canons) => { const s = new Set(); for (const c of canons) { variantes(c, cat.eq).forEach((v) => s.add(v)); s.add(c); } return s; };
  if (olts.length) nombres = expandir(olts.map((o) => canonOlt(o, cat.eq) || o.toUpperCase()));
  if (ofis.length) {
    const ids = new Set(ofis.map(String));
    const deOficina = expandir([...cat.porCanon.values()].filter((o) => ids.has(String(o.oficina_id))).map((o) => o.canon));
    nombres = nombres ? new Set([...nombres].filter((n) => deOficina.has(n))) : deOficina;
  }
  if (nombres) { if (!nombres.size) return json({ clientes: [], siguiente: null }); enLista("olt", [...nombres]); }
  let r;
  try {
    r = await env.DB.prepare(
      `SELECT rowid AS rid, sn_norm, cuenta, nombre, telefono_casa, telefono_oficina, correo, cedula, sucursal, estado_geo, olt, tarjeta, puerto, sector, municipio, direccion, ubicacion,
              estado_contrato, estado_onu, visto
         FROM clientes_olt WHERE ${where.join(" AND ")} ORDER BY rowid LIMIT ${MAX}`).bind(...params).all();
  } catch (e) {
    return badRequest("Falta aplicar la migración 049 (informe Clientes por OLT).");
  }
  await registrarUso(env.DB, "lect_mapa", lecturas(r));
  const filas = r.results;
  const clientes = filas.map((x) => {
    const i = infoOlt(x.olt, cat);
    return { nombre: x.nombre || "", telefono: x.telefono_casa || "", telefono_oficina: x.telefono_oficina || "", correo: x.correo || "", cuenta: x.cuenta || "", cedula: x.cedula || "",
      sucursal: x.sucursal || "", estado: x.estado_geo || "", oficina: i.oficina || "", olt: i.codigo, tarjeta: x.tarjeta, puerto: x.puerto, sector: x.sector || "", municipio: x.municipio || "",
      direccion: x.direccion || "", ubicacion: x.ubicacion || "", estatus_grafana: x.estado_contrato || "", estatus_olt: x.estado_onu || "", serial: x.sn_norm || "", ultima_vez: x.visto || "" };
  });
  return json({ clientes, siguiente: filas.length === MAX ? filas[filas.length - 1].rid : null });
}
