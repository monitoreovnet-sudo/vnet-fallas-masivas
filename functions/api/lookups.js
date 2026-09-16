import { json } from "../_lib/helpers.js";

export async function onRequestGet({ env }) {
  const db = env.DB;

  const [oficinas, categorias, afectaciones, comentarios, unidades, estadosTicket, estadosPuerto] =
    await Promise.all([
      db.prepare("SELECT id, codigo, nombre, estado, localidad FROM oficinas WHERE activo = 1 ORDER BY nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_categorias ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, categoria_id, nombre FROM catalogo_afectaciones ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_comentarios ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_unidades_resolutorias ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_estados_ticket ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_estados_puerto ORDER BY orden, nombre").all(),
    ]);

  return json({
    oficinas: oficinas.results,
    categorias: categorias.results,
    afectaciones: afectaciones.results,
    comentarios: comentarios.results,
    unidades_resolutorias: unidades.results,
    estados_ticket: estadosTicket.results,
    estados_puerto: estadosPuerto.results,
  });
}

// GET /api/lookups/olts?oficina_id=NN  -> OLTs de esa oficina
export async function onRequestPost({ request, env }) {
  const { oficina_id } = await request.json();
  const db = env.DB;
  const olts = await db
    .prepare("SELECT id, codigo, num_tarjetas, puertos_por_tarjeta FROM olts WHERE oficina_id = ? AND activo = 1 ORDER BY codigo")
    .bind(oficina_id)
    .all();
  return json({ olts: olts.results });
}
