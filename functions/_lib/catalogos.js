// Lista blanca de tablas que el módulo de Administración puede editar.
// Nunca se acepta un nombre de tabla que no esté aquí (evita SQL injection
// vía nombre de tabla, que no se puede parametrizar con bind()).
export const CATALOGOS = {
  oficinas: { columnas: ["codigo", "nombre", "estado", "localidad", "activo"], orden: "nombre" },
  olts: { columnas: ["oficina_id", "codigo", "num_tarjetas", "puertos_por_tarjeta", "activo"], orden: "codigo" },
  catalogo_categorias: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
  catalogo_afectaciones: { columnas: ["categoria_id", "nombre", "orden"], orden: "orden, nombre" },
  catalogo_comentarios: { columnas: ["categoria_id", "nombre", "orden"], orden: "orden, nombre" },
  catalogo_unidades_resolutorias: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
  catalogo_estados_ticket: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
  catalogo_estados_puerto: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
};

// Catálogos con relación "muchos a muchos": además de sus columnas, guardan una lista de ids en una tabla puente.
//  - Una incidencia (afectación) puede pertenecer a varios Tipos de Incidencia (categorías).
//  - Un comentario puede aplicar a varios Tipos de Incidencia (sin ninguno marcado = aplica a todos).
export const ENLACES = {
  catalogo_afectaciones: { tabla: "afectacion_categorias", col: "afectacion_id", otro: "categoria_id", campo: "categorias_ids", obligatorio: true, legado: "categoria_id" },
  catalogo_comentarios: { tabla: "comentario_categorias", col: "comentario_id", otro: "categoria_id", campo: "categorias_ids", obligatorio: false, legado: "categoria_id" },
};

export function idsDe(body, enlace) {
  const v = body?.[enlace.campo];
  if (v === undefined) return undefined;
  return [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

export async function guardarEnlaces(env, enlace, id, ids) {
  const st = [env.DB.prepare(`DELETE FROM ${enlace.tabla} WHERE ${enlace.col} = ?`).bind(id)];
  for (const o of ids) st.push(env.DB.prepare(`INSERT OR IGNORE INTO ${enlace.tabla} (${enlace.col}, ${enlace.otro}) VALUES (?, ?)`).bind(id, o));
  await env.DB.batch(st);
}
