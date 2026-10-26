-- Migración 026: un Comentario puede aplicar a VARIOS Tipos de Incidencia (categorías).
-- (Reemplaza la relación comentario→incidencias de la migración 025, que no se usa.)
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_026_comentarios_por_tipo.sql

DROP TABLE IF EXISTS comentario_afectaciones;

CREATE TABLE IF NOT EXISTS comentario_categorias (
  comentario_id INTEGER NOT NULL REFERENCES catalogo_comentarios(id),
  categoria_id  INTEGER NOT NULL REFERENCES catalogo_categorias(id),
  PRIMARY KEY (comentario_id, categoria_id)
);

-- Conserva lo que ya existe: los comentarios ligados a un Tipo siguen en ese Tipo.
-- Los que no tenían Tipo (aplican a todos) quedan sin relaciones = aplican a todos.
INSERT OR IGNORE INTO comentario_categorias (comentario_id, categoria_id)
  SELECT id, categoria_id FROM catalogo_comentarios WHERE categoria_id IS NOT NULL;
