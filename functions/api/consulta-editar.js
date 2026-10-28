import { json, badRequest, forbidden, getCurrentUser, nowIso } from "../_lib/helpers.js";
import { programarReevaluacion } from "../_lib/asociacion.js";
import { verificarTokenEdicion } from "../_lib/auth.js";

// POST /api/consulta-editar     (tabla "tipo Excel" de Consultar / Log)
// Body: { token: "<permiso temporal de /api/auth/verificar-edicion>", cambios: [ { registro: <id de ticket_puertos>, campo: "<campo>", valor: <nuevo valor> }, … ] }
//
// · Solo administrador y supervisor, y con el permiso temporal que se obtiene volviendo a escribir su contraseña (30 min, ligado a su usuario).
// · Todo o nada: si una sola celda no es válida no se guarda ninguna (D1 batch = una transacción).
// · Los campos del TICKET (ticket, estado, fechas…) se repiten en cada fila de ese ticket: se guardan una sola vez, en el ticket.
//   Los del REGISTRO (OLT, tarjeta, puerto, oficina, clientes…) se guardan solo en esa fila.
// · Cada cambio queda en el log del ticket (tipo "excel") con el usuario que lo hizo.
const ROLES_EDITORES = ["administrador", "supervisor"];
const MAX_CAMBIOS = 1000;

const NOMBRES_NA = ["LÓGICO", "SOPORTE TÉCNICO PERO NO APLICA", "CENTRAL TELEFÓNICA", "HERRAMIENTAS VNET", "MERCADEO", "PAGOS"];
const CAMPOS_NA = ["olt", "tarjeta", "puerto", "sector", "edificio"];

// tipo: num = solo dígitos · numvac = solo dígitos o vacío · cat = valor del catálogo · catvac = catálogo o vacío · txt = texto libre
//       fecha = ISO "AAAA-MM-DDTHH:MM[:SS]" o vacío · texto = texto no vacío · cant = entero ≥ 0
const CAMPOS_TICKET = {
  ticket_cmr: { tipo: "num" },
  tickets_vinculados: { tipo: "numvac" },
  estado_ticket: { tipo: "cat", tabla: "catalogo_estados_ticket" },
  unidad_resolutoria: { tipo: "catvac", tabla: "catalogo_unidades_resolutorias" },
  categoria_afectacion: { tipo: "cat", tabla: "catalogo_categorias" },
  afectacion: { tipo: "cat", tabla: "catalogo_afectaciones" },
  comentario: { tipo: "txt", max: 300 },
  descripcion: { tipo: "txt", max: 2000 },
  avance_cmr: { tipo: "txt", max: 2000 },
  fecha_falla: { tipo: "fecha" },
  fecha_apertura_cmr: { tipo: "fecha", noVacio: true },
  fecha_solucion_cda: { tipo: "fecha" },
  fecha_solucion_cmr: { tipo: "fecha" },
};
const CAMPOS_REGISTRO = {
  olt: { tipo: "texto", max: 60 },
  tarjeta: { tipo: "texto", max: 60 },
  puerto: { tipo: "texto", max: 60 },
  sector: { tipo: "texto", max: 120 },
  edificio: { tipo: "texto", max: 120 },
  no_clientes_reportaron: { tipo: "cant" },
  nro_clientes_afectados: { tipo: "cant" },
  fecha_cierre_cda: { tipo: "fecha" },
  fecha_cierre_cmr: { tipo: "fecha" },
  oficina: { tipo: "oficina" },      // se recibe el NOMBRE y se guarda oficina_id
};

const vacio = (v) => v === null || v === undefined || String(v).trim() === "";

// Devuelve { ok: valorNormalizado } o { error: "texto" }
function validar(def, valorBruto, catalogos) {
  const v = valorBruto === null || valorBruto === undefined ? "" : String(valorBruto).trim();
  switch (def.tipo) {
    case "num": return /^[0-9]+$/.test(v) ? { ok: v } : { error: "debe contener solo números" };
    case "numvac": return v === "" ? { ok: null } : /^[0-9]+$/.test(v) ? { ok: v } : { error: "debe contener solo números (o quedar vacío)" };
    case "cat": return catalogos[def.tabla].has(v) ? { ok: v } : { error: `"${v}" no existe en el catálogo` };
    case "catvac": return v === "" ? { ok: null } : catalogos[def.tabla].has(v) ? { ok: v } : { error: `"${v}" no existe en el catálogo` };
    case "txt": return v.length > def.max ? { error: `máximo ${def.max} caracteres` } : { ok: v === "" ? null : v };
    case "texto": return v === "" ? { error: "no puede quedar vacío" } : v.length > def.max ? { error: `máximo ${def.max} caracteres` } : { ok: v };
    case "cant": {
      if (!/^[0-9]+$/.test(v)) return { error: "debe ser un número entero igual o mayor que 0" };
      const n = Number(v);
      return Number.isSafeInteger(n) ? { ok: n } : { error: "número demasiado grande" };
    }
    case "fecha": {
      if (v === "") return def.noVacio ? { error: "no puede quedar vacía" } : { ok: null };
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (!m) return { error: "fecha inválida (usa dd/mm/aaaa hh:mm)" };
      const [, a, mo, d, h = "00", mi = "00", se = "00"] = m;
      const dt = new Date(Date.UTC(+a, +mo - 1, +d, +h, +mi, +se));
      if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d || +h > 23 || +mi > 59 || +se > 59) return { error: "fecha u hora inexistente" };
      return { ok: `${a}-${mo}-${d}T${h}:${mi}:${se}` };
    }
    default: return { error: "campo no editable" };
  }
}

function enLotes(arr, n) { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; }

export async function onRequestPost({ request, env, waitUntil }) {
  const db = env.DB;
  const body = await request.json().catch(() => ({}));

  // 1) Quién es y qué rol tiene (se revisa en el servidor, no solo en la pantalla)
  const usuario = await getCurrentUser(db, request);
  if (!usuario.rol || !ROLES_EDITORES.includes(usuario.rol)) {
    return forbidden("Solo administradores y supervisores pueden editar la tabla.");
  }
  // 2) Permiso temporal (se obtuvo con su contraseña)
  if (!(await verificarTokenEdicion(body.token, usuario.email, env))) {
    return json({ error: "El permiso de edición venció o no es válido. Vuelve a activar \"Editar como cuadro de Excel\" con tu contraseña.", reautenticar: true }, 403);
  }

  // 3) Forma del pedido
  const cambios = Array.isArray(body.cambios) ? body.cambios : [];
  if (!cambios.length) return badRequest("No hay cambios para guardar.");
  if (cambios.length > MAX_CAMBIOS) return badRequest(`Máximo ${MAX_CAMBIOS} celdas por guardado. Guarda en partes.`);
  for (const c of cambios) {
    if (!c || !/^[0-9]+$/.test(String(c.registro)) || typeof c.campo !== "string" || !(c.campo in CAMPOS_TICKET || c.campo in CAMPOS_REGISTRO)) {
      return badRequest(`Cambio no válido (${JSON.stringify(c).slice(0, 80)}).`);
    }
  }

  // 4) Datos actuales de los registros implicados
  const ids = [...new Set(cambios.map((c) => Number(c.registro)))];
  const registros = new Map();
  for (const lote of enLotes(ids, 80)) {
    const { results } = await db.prepare(
      `SELECT p.id, p.ticket_id, p.oficina_id, p.olt, p.tarjeta, p.puerto, p.sector, p.edificio, p.no_clientes_reportaron, p.nro_clientes_afectados,
              p.fecha_cierre_cda, p.fecha_cierre_cmr, o.nombre AS oficina_nombre
         FROM ticket_puertos p LEFT JOIN oficinas o ON o.id = p.oficina_id WHERE p.id IN (${lote.map(() => "?").join(",")})`
    ).bind(...lote).all();
    results.forEach((r) => registros.set(r.id, r));
  }
  const ticketIds = [...new Set([...registros.values()].map((r) => r.ticket_id))];
  const tickets = new Map();
  for (const lote of enLotes(ticketIds, 80)) {
    const { results } = await db.prepare(`SELECT * FROM tickets WHERE id IN (${lote.map(() => "?").join(",")})`).bind(...lote).all();
    results.forEach((t) => tickets.set(t.id, t));
  }
  const catalogos = {};
  for (const tabla of ["catalogo_estados_ticket", "catalogo_unidades_resolutorias", "catalogo_categorias", "catalogo_afectaciones"]) {
    const { results } = await db.prepare(`SELECT nombre FROM ${tabla}`).all();
    catalogos[tabla] = new Set(results.map((r) => r.nombre));
  }
  const { results: ofis } = await db.prepare("SELECT id, nombre FROM oficinas").all();
  const ofPorNombre = new Map(ofis.map((o) => [o.nombre.toLowerCase(), o]));
  const sinTildes = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/^\s*\d+\s*[.)]\s*/, "").replace(/,/g, "").trim();
  const nombresNA = new Set(NOMBRES_NA.map(sinTildes));
  const idsNA = new Set(ofis.filter((o) => nombresNA.has(sinTildes(o.nombre))).map((o) => o.id));

  // 5) Validar TODO antes de tocar nada
  const errores = [];
  const err = (reg, campo, msg) => { if (errores.length < 12) errores.push(`Ticket ${reg.ticket_cmr ?? tickets.get(reg.ticket_id)?.ticket_cmr}, ${campo}: ${msg}`); };
  const nuevosTicket = new Map();     // ticket_id -> { campo: valor }
  const nuevosRegistro = new Map();   // registro_id -> { columna: valor }
  for (const c of cambios) {
    const reg = registros.get(Number(c.registro));
    if (!reg) { errores.push(`El registro ${c.registro} ya no existe (otra persona pudo eliminarlo). Actualiza la tabla.`); continue; }
    const esTicket = c.campo in CAMPOS_TICKET;
    const def = esTicket ? CAMPOS_TICKET[c.campo] : CAMPOS_REGISTRO[c.campo];
    const r = c.campo === "oficina" ? { ok: String(c.valor ?? "").trim() } : validar(def, c.valor, catalogos);
    if (r.error) { err(reg, c.campo, r.error); continue; }
    if (esTicket) {
      if (!nuevosTicket.has(reg.ticket_id)) nuevosTicket.set(reg.ticket_id, {});
      nuevosTicket.get(reg.ticket_id)[c.campo] = r.ok;
    } else if (c.campo === "oficina") {
      const of = ofPorNombre.get(r.ok.toLowerCase());
      if (!of) { err(reg, "Oficina", `"${c.valor}" no existe en el catálogo`); continue; }
      if (!nuevosRegistro.has(reg.id)) nuevosRegistro.set(reg.id, {});
      nuevosRegistro.get(reg.id).oficina_id = of.id;
    } else {
      if (!nuevosRegistro.has(reg.id)) nuevosRegistro.set(reg.id, {});
      nuevosRegistro.get(reg.id)[c.campo] = r.ok;
    }
  }
  // Número de ticket: único y sin repetirse dentro del mismo guardado
  const cmrNuevos = new Set();
  for (const [tid, campos] of nuevosTicket) {
    if (!("ticket_cmr" in campos)) continue;
    const actual = tickets.get(tid);
    if (campos.ticket_cmr === actual.ticket_cmr) continue;
    if (cmrNuevos.has(campos.ticket_cmr)) { err({ ticket_id: tid }, "ticket_cmr", "dos tickets quedarían con el mismo número"); continue; }
    cmrNuevos.add(campos.ticket_cmr);
    const dup = await db.prepare("SELECT id FROM tickets WHERE ticket_cmr = ? AND id <> ?").bind(campos.ticket_cmr, tid).first();
    if (dup) err({ ticket_id: tid }, "ticket_cmr", `ya existe otro ticket con el número ${campos.ticket_cmr}`);
  }
  // Oficinas sin OLT/tarjeta/puerto/sector/edificio (Central telefónica, Pagos…): esos campos solo pueden ser "N/A"
  const naAuto = [];
  for (const [rid, campos] of nuevosRegistro) {
    const reg = registros.get(rid);
    const ofFinal = "oficina_id" in campos ? campos.oficina_id : reg.oficina_id;
    if (!idsNA.has(ofFinal)) continue;
    for (const f of CAMPOS_NA) {
      if (f in campos && campos[f] !== "N/A") err(reg, f, "esta oficina no tiene OLT, tarjeta, puerto, sector ni edificio: debe quedar en N/A");
    }
    if ("oficina_id" in campos && !idsNA.has(reg.oficina_id)) {
      CAMPOS_NA.forEach((f) => { if (!(f in campos)) { campos[f] = "N/A"; naAuto.push([rid, f]); } });
    }
  }
  if (errores.length) return json({ error: `No se guardó nada. Corrige estas celdas:\n• ${errores.join("\n• ")}` }, 400);

  // 6) Armar todo en UNA transacción
  const ahora = nowIso();
  const stmts = [];
  const log = (ticket_id, ticket_puerto_id, campo, antes, despues) => stmts.push(
    db.prepare(`INSERT INTO ticket_log (ticket_id, ticket_puerto_id, tipo_cambio, campo, valor_anterior, valor_nuevo, usuario_email)
                VALUES (?, ?, 'excel', ?, ?, ?, ?)`).bind(ticket_id, ticket_puerto_id, campo, antes === null || antes === undefined ? null : String(antes), despues === null || despues === undefined ? null : String(despues), usuario.email));
  let nTickets = 0, nRegistros = 0, nCeldas = 0;
  for (const [tid, campos] of nuevosTicket) {
    const actual = tickets.get(tid);
    const dif = Object.keys(campos).filter((k) => String(actual[k] ?? "") !== String(campos[k] ?? ""));
    if (!dif.length) continue;
    stmts.push(db.prepare(`UPDATE tickets SET ${dif.map((k) => `${k} = ?`).join(", ")}, actualizado_en = ? WHERE id = ?`).bind(...dif.map((k) => campos[k]), ahora, tid));
    dif.forEach((k) => log(tid, null, k, actual[k], campos[k]));
    nTickets++; nCeldas += dif.length;
  }
  for (const [rid, campos] of nuevosRegistro) {
    const reg = registros.get(rid);
    const dif = Object.keys(campos).filter((k) => String(reg[k] ?? "") !== String(campos[k] ?? ""));
    if (!dif.length) continue;
    stmts.push(db.prepare(`UPDATE ticket_puertos SET ${dif.map((k) => `${k} = ?`).join(", ")}, actualizado_en = ? WHERE id = ?`).bind(...dif.map((k) => campos[k]), ahora, rid));
    dif.forEach((k) => log(reg.ticket_id, rid, k === "oficina_id" ? "oficina" : k, k === "oficina_id" ? reg.oficina_nombre : reg[k], k === "oficina_id" ? (ofis.find((o) => o.id === campos[k])?.nombre ?? campos[k]) : campos[k]));
    nRegistros++; nCeldas += dif.length;
  }
  if (!stmts.length) return json({ ok: true, celdas: 0, tickets: 0, registros: 0, mensaje: "No había diferencias con lo guardado." });
  await db.batch(stmts);
  await programarReevaluacion({ env, waitUntil }, [...new Set([...nuevosTicket.keys(), ...[...nuevosRegistro.keys()].map((r) => registros.get(r)?.ticket_id)])]);
  return json({ ok: true, celdas: nCeldas, tickets: nTickets, registros: nRegistros });
}
