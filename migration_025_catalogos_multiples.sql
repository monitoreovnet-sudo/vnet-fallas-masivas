-- Migración 025: una Incidencia (afectación) puede pertenecer a VARIOS Tipos de Incidencia (categorías),
-- y un Comentario puede aplicar a VARIAS Incidencias.
-- Conserva lo que ya existe: copia las relaciones actuales a las tablas nuevas.
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_025_catalogos_multiples.sql

CREATE TABLE IF NOT EXISTS afectacion_categorias (
  afectacion_id INTEGER NOT NULL REFERENCES catalogo_afectaciones(id),
  categoria_id  INTEGER NOT NULL REFERENCES catalogo_categorias(id),
  PRIMARY KEY (afectacion_id, categoria_id)
);

CREATE TABLE IF NOT EXISTS comentario_afectaciones (
  comentario_id INTEGER NOT NULL REFERENCES catalogo_comentarios(id),
  afectacion_id INTEGER NOT NULL REFERENCES catalogo_afectaciones(id),
  PRIMARY KEY (comentario_id, afectacion_id)
);

INSERT OR IGNORE INTO afectacion_categorias (afectacion_id, categoria_id)
  SELECT id, categoria_id FROM catalogo_afectaciones WHERE categoria_id IS NOT NULL;

-- Comentarios que estaban ligados a un Tipo: pasan a las incidencias de ese Tipo.
-- Los que no tenían Tipo (aplican a todo) quedan sin relaciones = aplican a todas las incidencias.
INSERT OR IGNORE INTO comentario_afectaciones (comentario_id, afectacion_id)
  SELECT c.id, a.id FROM catalogo_comentarios c JOIN catalogo_afectaciones a ON a.categoria_id = c.categoria_id
  WHERE c.categoria_id IS NOT NULL;
