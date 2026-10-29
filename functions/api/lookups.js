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

  // Relaciones muchas-a-muchos (migración 025). Si aún no se aplicó, todo sigue funcionando con las columnas viejas.
  const rel = async (tabla, a, b) => {
    try {
      const m = new Map();
      (await db.prepare(`SELECT ${a} AS a, ${b} AS b FROM ${tabla}`).all()).results.forEach((r) => { if (!m.has(r.a)) m.set(r.a, []); m.get(r.a).push(r.b); });
      return m;
    } catch (e) { return new Map(); }
  };
  const [afCat, comCat] = await Promise.all([rel("afectacion_categorias", "afectacion_id", "categoria_id"), rel("comentario_categorias", "comentario_id", "categoria_id")]);
  afectaciones.results.forEach((a) => { a.categoria_ids = afCat.get(a.id) || (a.categoria_id ? [a.categoria_id] : []); });
  comentarios.results.forEach((c) => { c.categoria_ids = comCat.get(c.id) || (c.categoria_id ? [c.categoria_id] : []); });   // vacío = aplica a todos los tipos

  // OLT → oficina (catálogo + lo ya registrado en tickets): para los filtros escalonados Estado > Oficina > OLT
  let oltOficina = [];
  try {
    const a = await db.prepare("SELECT codigo AS olt, oficina_id FROM olts WHERE activo = 1 AND oficina_id IS NOT NULL").all();
    const b = await db.prepare("SELECT DISTINCT olt, oficina_id FROM ticket_puertos WHERE olt IS NOT NULL AND olt <> '' AND oficina_id IS NOT NULL").all();
    const vistos = new Set();
    oltOficina = [...a.results, ...b.results].filter((r) => { const k = r.olt + "|" + r.oficina_id; if (vistos.has(k)) return false; vistos.add(k); return true; });
  } catch (e) { oltOficina = []; }

  // Sectores por oficina (migración 037): { "<oficina_id>": ["Sector A", ...] }. Si aún no se aplicó, queda vacío.
  const sectores = {};
  try {
    (await db.prepare("SELECT oficina_id, sector FROM oficina_sectores ORDER BY sector COLLATE NOCASE").all()).results
      .forEach((r) => { (sectores[r.oficina_id] || (sectores[r.oficina_id] = [])).push(r.sector); });
  } catch (e) { /* sin migración: el campo Sector sigue funcionando como texto libre */ }

  return json({
    sectores,
    oficinas: oficinas.results,
    categorias: categorias.results,
    afectaciones: afectaciones.results,
    comentarios: comentarios.results,
    unidades_resolutorias: unidades.results,
    estados_ticket: estadosTicket.results,
    estados_puerto: estadosPuerto.results,
    olts: olts.results,
    olts_usados: oltsUsados.results.map((r) => r.olt),
    olt_oficina: oltOficina,
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
