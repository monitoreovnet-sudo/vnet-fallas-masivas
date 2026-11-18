import { json, badRequest, notFound, requireRole, logCambio, getCurrentUser } from "../../../_lib/helpers.js";
import { ROLES_CLIENTES } from "../../../_lib/clientes.js";
import { registrarUso, escrituras } from "../../../_lib/uso-d1.js";
import { catalogo, canonOlt } from "../../../_lib/informe2.js";

const norm = (v) => { const s = String(v ?? "").trim().toUpperCase(); return /^\d+$/.test(s) ? String(Number(s)) : s; };

// POST /api/clientes/ticket-lista/finalizar   Body: { lista_id, total, usar: "archivo" | "registrado" }
//   usar = "registrado": el ticket conserva el número que ya tenía (la lista queda guardada de todos modos).
//   usar = "archivo":    cada registro del ticket (OLT + tarjeta + puerto) toma como «Nro. clientes afectados» la cantidad de clientes del archivo en ese puerto.
// Respuesta: { total, actualizados, sin_registro: [ {olt, tarjeta, puerto, clientes} ] }  (puertos del archivo que el ticket no tiene)
export async function onRequestPost({ request, env }) {
  const no = await requireRole(env.DB, request, ROLES_CLIENTES);
  if (no) return no;
  const b = await request.json();
  const lista = await env.DB.prepare("SELECT id, ticket_id FROM ticket_listas_clientes WHERE id = ?").bind(Number(b.lista_id)).first();
  if (!lista) return notFound("La lista no existe.");
  const usar = b.usar === "archivo" ? "archivo" : "registrado";
  const total = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM ticket_lista_filas WHERE lista_id = ?").bind(lista.id).first()).n) || 0;
  if (!total) return badRequest("La lista no tiene filas.");
  let actualizados = 0, sinRegistro = [];
  if (usar === "archivo") {
    const cat = await catalogo(env.DB);
    const claveOlt = (o) => canonOlt(o, cat.eq) || String(o || "").trim().toUpperCase();
    const grupos = (await env.DB.prepare("SELECT olt, tarjeta, puerto, COUNT(*) AS n FROM ticket_lista_filas WHERE lista_id = ? GROUP BY olt, tarjeta, puerto").bind(lista.id).all()).results;
    const cuenta = new Map();
    for (const g of grupos) { const k = `${claveOlt(g.olt)}|${norm(g.tarjeta)}|${norm(g.puerto)}`; const c = cuenta.get(k) || { n: 0, g }; c.n += g.n; cuenta.set(k, c); }
    const regs = (await env.DB.prepare("SELECT id, olt, tarjeta, puerto, nro_clientes_afectados AS n FROM ticket_puertos WHERE ticket_id = ?").bind(lista.ticket_id).all()).results;
    const usados = new Set(), stmts = [];
    for (const r of regs) {
      const k = `${claveOlt(r.olt)}|${norm(r.tarjeta)}|${norm(r.puerto)}`, c = cuenta.get(k);
      if (!c) continue;
      usados.add(k);
      if (Number(r.n) !== c.n) stmts.push(env.DB.prepare("UPDATE ticket_puertos SET nro_clientes_afectados = ? WHERE id = ?").bind(c.n, r.id));
    }
    for (const [k, c] of cuenta) if (!usados.has(k)) sinRegistro.push({ olt: c.g.olt, tarjeta: c.g.tarjeta, puerto: c.g.puerto, clientes: c.n });
    for (let i = 0; i < stmts.length; i += 90) { const res = await env.DB.batch(stmts.slice(i, i + 90)); await registrarUso(env.DB, "ticket_onus", escrituras(res)); }
    actualizados = stmts.length;
  }
  const r = await env.DB.prepare("UPDATE ticket_listas_clientes SET estado = 'lista', total = ?, aplicada = ? WHERE id = ?").bind(total, usar === "archivo" ? 1 : 0, lista.id).run();
  await registrarUso(env.DB, "ticket_onus", escrituras(r));
  try { await logCambio(env.DB, { ticket_id: lista.ticket_id, tipo_cambio: "masivo", campo: "lista de clientes", valor_anterior: null, valor_nuevo: `Lista de ${total} clientes (${usar === "archivo" ? "se usó el número del archivo" : "se conservó el número registrado"})`, usuario_email: (await getCurrentUser(env.DB, request)).email }); } catch (e) { /* bitácora opcional */ }
  return json({ total, actualizados, sin_registro: sinRegistro.slice(0, 50) });
}
