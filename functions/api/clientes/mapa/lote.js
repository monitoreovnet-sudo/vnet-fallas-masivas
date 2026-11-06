import { json, badRequest, requireRole, nowIso } from "../../../_lib/helpers.js";
import { normSerial } from "../../../_lib/clientes.js";
import { claves, buscarClientes, cruzarUna } from "../../../_lib/cruce.js";
import { contextoSucursales } from "../../../_lib/sucursal.js";
import { registrarUso, usadoHoy, TOPE_DIA, sinCupoEscritura } from "../../../_lib/uso-d1.js";
import { registrarMapa } from "../../../_lib/mapa-clientes.js";

const MAX_LOTE = 100;
const t = (v, n = 80) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };
const ent = (v) => { const m = /^\s*(\d+)\s*$/.exec(String(v ?? "")); return m ? Number(m[1]) : null; };

// POST /api/clientes/mapa/lote   Body: { onus: [ {sn,name,olt,board,port,onu,status,contact} ], visto? }
// Para los archivos de SmartOLT que se suben al crear o editar un ticket: TODAS las ONUs (en cualquier estado) se cruzan con Grafana y,
// si coinciden, entran al mapa de clientes por OLT/tarjeta/puerto. No devuelve datos de clientes, solo conteos.
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ["administrador", "supervisor", "especialista"]);
  if (no) return no;
  const b = await request.json();
  const onus = Array.isArray(b.onus) ? b.onus : [];
  if (!onus.length) return badRequest("El lote viene vacío.");
  if (onus.length > MAX_LOTE) return badRequest(`El lote no puede pasar de ${MAX_LOTE} ONUs.`);
  if (sinCupoEscritura(await usadoHoy(env.DB))) return json({ recibidas: onus.length, cruzadas: 0, nuevos: 0, actualizados: 0, tope: true });
  const visto = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(b.visto || "")) ? String(b.visto).slice(0, 19) : nowIso().replace(" ", "T");
  // Por serial y, en las sucursales que ya tienen índices, también por cuenta/cédula/nombre (sin barrer la base)
  // Solo por serial (consulta por llave, casi sin lecturas): el cruce completo de las ONUs afectadas lo hace el propio ticket
  const mapas = await buscarClientes(env.DB, onus.map(claves), { soloSerial: true, sucursales: await contextoSucursales(env.DB), olts: onus.map((o) => t(o.olt)) });
  await registrarUso(env.DB, "lect_mapa", mapas.lecturas);
  const items = [];
  onus.forEach((o) => {
    const { cliente } = cruzarUna(claves(o), mapas);
    if (cliente && t(o.olt)) items.push({ sn_norm: normSerial(o.sn) || null, cliente, olt: t(o.olt), tarjeta: ent(o.board), puerto: ent(o.port), onu_num: t(o.onu, 20), status: t(o.status, 30), visto });
  });
  const r = await registrarMapa(env.DB, items);
  await registrarUso(env.DB, "mapa", r.escrituras);
  return json({ recibidas: onus.length, cruzadas: items.length, nuevos: r.nuevos, actualizados: r.actualizados, usado: await usadoHoy(env.DB), tope_dia: TOPE_DIA });
}
