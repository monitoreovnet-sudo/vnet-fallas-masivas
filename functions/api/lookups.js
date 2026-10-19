import { json } from "../_lib/helpers.js";

export async function onRequestGet({ env }) {
  const db = env.DB;

  const [oficinas, categorias, afectaciones, comentarios, unidades, estadosTicket, estadosPuerto, olts, oltsUsados] =
    await Promise.all([
      // SELECT * (incluye "tipo" si la migración 015 ya se aplicó; funciona igual antes de aplicarla)
      db.prepare("SELECT * FROM oficinas WHERE activo = 1 ORDER BY nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_categorias ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, categoria_id, nombre FROM catalogo_afectaciones ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, categoria_id, nombre FROM catalogo_comentarios ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_unidades_resolutorias ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_estados_ticket ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, nombre FROM catalogo_estados_puerto ORDER BY orden, nombre").all(),
      db.prepare("SELECT id, codigo FROM olts WHERE activo = 1 ORDER BY codigo").all(),
      // OLT que aparecen en tickets ya registrados (incluye históricos que ya no están en el catálogo): solo para el filtro de Consultar
      db.prepare("SELECT DISTINCT olt FROM ticket_puertos WHERE olt IS NOT NULL AND olt <> '' ORDER BY olt").all(),
    ]);

  return json({
    oficinas: oficinas.results,
    categorias: categorias.results,
    afectaciones: afectaciones.results,
    comentarios: comentarios.results,
    unidades_resolutorias: unidades.results,
    estados_ticket: estadosTicket.results,
    estados_puerto: estadosPuerto.results,
    olts: olts.results,
    olts_usados: oltsUsados.results.map((r) => r.olt),
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
