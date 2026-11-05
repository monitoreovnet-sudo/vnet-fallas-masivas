// Cruce de las ONUs de un TICKET (ticket_onus) con la base de clientes de Grafana. Guarda los datos del cliente en la propia fila de la ONU.
// Reglas: el ticket debe estar abierto; la ONU solo se cruza si la fecha en que se cargó al ticket está a lo sumo N días (parámetro
// ventana_ticket_grafana_dias, por defecto 2) de la fecha del archivo de Grafana de la sucursal del cliente. Lo ya cruzado no se vuelve a tocar.
import { normNombre } from "./clientes.js";
import { buscarClientes, cruzarUna, leerParametro } from "./cruce.js";
import { nowIso } from "./helpers.js";
import { registrarUso, escrituras } from "./uso-d1.js";
import { contextoSucursales } from "./sucursal.js";

const sinCeros = (s) => String(s).replace(/^0+(?=\d)/, "");
export const TANDA_CRUCE = 100;

// Datos de una ONU del ticket que sirven para buscar al cliente (mismo orden de cascada que la auditoría: serial, cuenta, cédula, nombre único)
export function clavesDeOnuTicket(o) {
  const cuenta = String(o.cuenta ?? "").replace(/\D/g, "");
  const nombre = normNombre(o.nombre);
  return {
    snNorm: o.serial || null,
    contactC: [],
    cuentaName: cuenta ? [...new Set([cuenta, sinCeros(cuenta)])] : [],
    cedulas: !o.cedula ? [] : /^[A-Z]/.test(o.cedula) ? [o.cedula] : ["V" + o.cedula, "E" + o.cedula],
    nombreC: nombre.split(" ").filter(Boolean).length >= 2 ? nombre : null,
  };
}
// Ambas fechas están en hora de Caracas ("AAAA-MM-DD HH:MM:SS" o con T): se comparan como horas "locales" sin zona.
const msNaive = (f) => Date.parse(String(f).trim().replace(" ", "T").slice(0, 19) + "Z");
export const horasEntreCaracas = (a, b) => Math.abs(msNaive(a) - msNaive(b)) / 3600000;

export async function resumenCruceTicket(db, ticketId) {
  const r = await db.prepare("SELECT COUNT(*) AS total, SUM(cli_cuenta IS NOT NULL) AS cruzadas FROM ticket_onus WHERE ticket_id = ?").bind(ticketId).first();
  return { total: r.total || 0, con_cliente: r.cruzadas || 0, sin_cruzar: (r.total || 0) - (r.cruzadas || 0) };
}

// Procesa UNA tanda de ONUs pendientes del ticket (id > desdeId). Devuelve { siguiente, cruzadas, fuera_ventana, ... }; siguiente = null al terminar.
export async function cruzarTandaTicket(db, ticket, desdeId) {
  if (["RESUELTO", "CERRADO"].includes(ticket.estado_ticket)) return { siguiente: null, cruzadas: 0, fuera_ventana: 0, omitido: "El ticket ya está " + ticket.estado_ticket + ".", ...(await resumenCruceTicket(db, ticket.id)) };
  const onus = (await db.prepare(
    "SELECT id, olt, serial, cuenta, cedula, nombre, creado_en FROM ticket_onus WHERE ticket_id = ? AND id > ? AND cli_cuenta IS NULL ORDER BY id LIMIT ?")
    .bind(ticket.id, desdeId, TANDA_CRUCE).all()).results;
  if (!onus.length) return { siguiente: null, cruzadas: 0, fuera_ventana: 0, ...(await resumenCruceTicket(db, ticket.id)) };

  const dias = await leerParametro(db, "ventana_ticket_grafana_dias", 2);
  const vigentes = new Map((await db.prepare("SELECT sucursal, fecha_base FROM cargas_base WHERE estado = 'vigente'").all()).results.map((b) => [b.sucursal, b.fecha_base]));
  const lista = onus.map(clavesDeOnuTicket);
  const mapas = await buscarClientes(db, lista, { barrido: true, sucursales: await contextoSucursales(db), olts: onus.map((o) => o.olt) });
  await registrarUso(db, "lect_ticket", mapas.lecturas);
  const ahora = nowIso();
  const stmts = [];
  let fuera = 0;
  onus.forEach((o, i) => {
    const { cliente: c, metodo } = cruzarUna(lista[i], mapas);
    if (!c) return;
    const base = vigentes.get(c.sucursal);
    if (!base || !o.creado_en || horasEntreCaracas(o.creado_en, base) > dias * 24) { fuera++; return; }
    stmts.push(db.prepare(
      `UPDATE ticket_onus SET cli_cuenta = ?, cli_nombre = ?, cli_cedula = ?, cli_correo = ?, cli_correo_iptv = ?, cli_tel_casa = ?, cli_tel_oficina = ?,
         cli_direccion = ?, cli_municipio = ?, cli_parroquia = ?, cli_sector = ?, cli_estado_contrato = ?, cli_fecha_contrato = ?, cli_sucursal = ?,
         cruce_metodo = ?, cruce_fecha = ?, cruce_base_fecha = ? WHERE id = ?`)
      .bind(c.cuenta, c.nombre, c.cedula, c.correo || null, c.correo_iptv || null, c.telefono_casa || null, c.telefono_oficina || null,
        c.direccion || null, c.municipio || null, c.parroquia || null, c.sector || null, c.estado_contrato || null, c.fecha_creacion || null, c.sucursal,
        metodo, ahora, base, o.id));
  });
  let esc = 0;
  for (let i = 0; i < stmts.length; i += 100) esc += escrituras(await db.batch(stmts.slice(i, i + 100)));
  await registrarUso(db, "cruce_ticket", esc);
  const fin = onus.length < TANDA_CRUCE;
  return { siguiente: fin ? null : onus[onus.length - 1].id, cruzadas: stmts.length, fuera_ventana: fuera, procesadas: onus.length, ...(fin ? await resumenCruceTicket(db, ticket.id) : {}) };
}
