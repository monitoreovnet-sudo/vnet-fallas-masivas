import { json, badRequest, requireRole } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { claves, buscarClientes, cruzarUna, basesDesactualizadas, resumenAuditoria } from "../../../_lib/cruce.js";

const TANDA = 100;

// POST /api/clientes/auditoria/recruzar   Body: { auditoria_id, desde_id }
// Vuelve a cruzar las ONUs de una auditoría con las bases ACTUALES (después de cargar una base más reciente).
// Procesa una tanda y devuelve desde_id siguiente (null al terminar) más el resumen final.
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const aud = await env.DB.prepare("SELECT * FROM auditorias WHERE id = ?").bind(Number(b.auditoria_id)).first();
  if (!aud) return badRequest("La auditoría no existe.");
  const desde = Number(b.desde_id) || 0;
  const onus = (await env.DB.prepare("SELECT id, sn, name_smartolt AS name, contact FROM auditoria_onus WHERE auditoria_id = ? AND id > ? ORDER BY id LIMIT ?").bind(aud.id, desde, TANDA).all()).results;
  if (!onus.length) return json({ siguiente: null, resumen: await resumenAuditoria(env.DB, aud.id) });

  const { mapa, alguna } = await basesDesactualizadas(env.DB, aud);
  const lista = onus.map(claves);
  const mapas = await buscarClientes(env.DB, lista);
  const stmts = onus.map((o, i) => {
    const { cliente: c, metodo } = cruzarUna(lista[i], mapas);
    const desact = c ? (mapa.get(c.carga_id) ? 1 : 0) : (alguna ? 1 : 0);
    return env.DB.prepare(
      `UPDATE auditoria_onus SET carga_id = ?, base_desactualizada = ?, cuenta = ?, metodo_cruce = ?, cli_nombre = ?, cli_telefono = ?,
         cli_cedula = ?, cli_sector = ?, cli_estado_contrato = ?, cli_sucursal = ?, cli_tel_casa = ?, cli_tel_oficina = ?, cli_ident_externo = ? WHERE id = ?`)
      .bind(c ? c.carga_id : null, desact, c ? c.cuenta : null, metodo, c ? c.nombre : null, c ? (c.telefono_casa || c.telefono_oficina || null) : null,
        c ? c.cedula_norm : null, c ? c.sector : null, c ? c.estado_contrato : null, c ? c.sucursal : null,
        c ? c.telefono_casa || null : null, c ? c.telefono_oficina || null : null, c ? c.cedula || null : null, o.id);
  });
  await env.DB.batch(stmts);
  return json({ siguiente: onus[onus.length - 1].id, procesadas: onus.length });
}
