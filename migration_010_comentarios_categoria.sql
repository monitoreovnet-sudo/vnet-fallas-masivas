-- Migración 010: relaciona cada comentario con un Tipo de Incidencia
-- (categoría de la afectación). categoria_id NULL significa que el
-- comentario aplica a TODAS las categorías (comportamiento actual de los
-- comentarios ya existentes, que se quedan como NULL).
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_010_comentarios_categoria.sql

ALTER TABLE catalogo_comentarios ADD COLUMN categoria_id INTEGER REFERENCES catalogo_categorias(id);
