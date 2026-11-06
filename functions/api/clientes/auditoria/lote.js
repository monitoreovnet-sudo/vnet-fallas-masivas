import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES, normSerial } from "../../../_lib/clientes.js";
import { claves, buscarClientes, cruzarUna, clasificar, normFechaCambio, basesDesactualizadas } from "../../../_lib/cruce.js";
import { contextoSucursales } from "../../../_lib/sucursal.js";
import { registrarUso, escrituras, usadoHoy, lecturasHoy, TOPE_DIA, LECT_SUAVE, LECT_DURO } from "../../../_lib/uso-d1.js";
import { registrarMapa } from "../../../_lib/mapa-clientes.js";

const MAX_LOTE = 100;
const t = (v, n = 200) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };
const ent = (v) => { const m = /^\s*(\d+)\s*$/.exec(String(v ?? "")); return m ? Number(m[1]) : null; };

export const SQL_INSERT_ONU =
  `INSERT INTO auditoria_onus (auditoria_id, carga_id, base_desactualizada, sn, sn_norm, olt_nombre, tarjeta, puerto, onu_num, name_smartolt,
     contact, status, last_status_change, zona, direccion_smartolt, clasificacion, cuenta, metodo_cruce,
     cli_nombre, cli_telefono, cli_cedula, cli_sector, cli_estado_contrato, cli_sucursal, cli_tel_casa, cli_tel_oficina, cli_ident_externo)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

// POST /api/clientes/auditoria/lote   Body: { auditoria_id, onus: [ {sn,name,olt,board,port,onu,zone,address,status,lsc,contact} ] }
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const onus = Array.isArray(b.onus) ? b.onus : [];
  if (!onus.length) return badRequest("El lote viene vacío.");
  if (onus.length > MAX_LOTE) return badRequest(`El lote no puede pasar de ${MAX_LOTE} ONUs.`);
  if (await usadoHoy(env.DB) >= TOPE_DIA) return json({ error: `Se alcanzó el tope diario de ${TOPE_DIA.toLocaleString("es-VE")} escrituras de D1. Continúe después de las 8:00 pm (hora de Caracas).` }, 429);
  const aud = await env.DB.prepare("SELECT * FROM auditorias WHERE id = ?").bind(Number(b.auditoria_id)).first();
  if (!aud) return badRequest("La auditoría no existe.");

  const { mapa, alguna } = await basesDesactualizadas(env.DB, aud);
  const lista = onus.map(claves);
  const leidasHoy = await lecturasHoy(env.DB);
  if (leidasHoy >= LECT_DURO) return json({ error: "Se alcanzó el tope diario de lecturas de D1. Continúe después de las 8:00 pm (hora de Caracas)." }, 429);
  const mapas = await buscarClientes(env.DB, lista, { barrido: leidasHoy < LECT_SUAVE, sucursales: await contextoSucursales(env.DB), olts: onus.map((o) => t(o.olt, 80) || aud.olt_nombre) });
  const cruces = lista.map((k) => {
    const { cliente: c, metodo } = cruzarUna(k, mapas);
    return { c, metodo, desact: c ? (mapa.get(c.carga_id) ? 1 : 0) : (alguna ? 1 : 0) };
  });
  const stmts = onus.map((o, i) => {
    const { c, metodo, desact } = cruces[i];
    return env.DB.prepare(SQL_INSERT_ONU).bind(
      aud.id, c ? c.carga_id : null, desact, t(o.sn, 80), normSerial(o.sn) || null,
      (t(o.olt, 80) || aud.olt_nombre).toUpperCase(), ent(o.board), ent(o.port), t(o.onu, 20), t(o.name, 200),
      t(o.contact, 80), t(o.status, 30), normFechaCambio(o.lsc), t(o.zone, 150), t(o.address, 300), clasificar(o.status),
      c ? c.cuenta : null, metodo,
      c ? c.nombre : null, c ? (c.telefono_casa || c.telefono_oficina || null) : null, c ? c.cedula_norm : null, c ? c.sector : null,
      c ? c.estado_contrato : null, c ? c.sucursal : null, c ? c.telefono_casa || null : null, c ? c.telefono_oficina || null : null, c ? c.cedula || null : null);
  });
  const esc1 = escrituras(await env.DB.batch(stmts));
  // Mapa de clientes por OLT/tarjeta/puerto: toda ONU que cruzó con Grafana, esté o no en falla
  const mp = await registrarMapa(env.DB, onus.map((o, i) => ({
    sn_norm: normSerial(o.sn) || null, cliente: cruces[i].c, olt: (t(o.olt, 80) || aud.olt_nombre).toUpperCase(), tarjeta: ent(o.board), puerto: ent(o.port),
    onu_num: t(o.onu, 20), status: t(o.status, 30), visto: aud.fecha_auditoria_local,
    ubicacion: [t(o.zone, 100), t(o.address, 200)].filter(Boolean).join(" — ") || null })));
  await registrarUso(env.DB, "auditoria", esc1);
  await registrarUso(env.DB, "lect_auditoria", mapas.lecturas);
  await registrarUso(env.DB, "mapa", mp.escrituras);
  return json({ guardadas: stmts.length, solo_serial: !!mapas.sin_barrido, lecturas: mapas.lecturas || 0 });
}
