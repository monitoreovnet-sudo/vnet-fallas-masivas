// Lista blanca de tablas que el módulo de Administración puede editar.
// Nunca se acepta un nombre de tabla que no esté aquí (evita SQL injection
// vía nombre de tabla, que no se puede parametrizar con bind()).
export const CATALOGOS = {
  oficinas: { columnas: ["codigo", "nombre", "estado", "localidad", "activo"], orden: "nombre" },
  olts: { columnas: ["oficina_id", "codigo", "num_tarjetas", "puertos_por_tarjeta", "activo"], orden: "codigo" },
  catalogo_categorias: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
  catalogo_afectaciones: { columnas: ["categoria_id", "nombre", "orden"], orden: "orden, nombre" },
  catalogo_comentarios: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
  catalogo_unidades_resolutorias: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
  catalogo_estados_ticket: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
  catalogo_estados_puerto: { columnas: ["nombre", "orden"], orden: "orden, nombre" },
};
