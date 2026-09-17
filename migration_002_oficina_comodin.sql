-- Migración 002: agrega la oficina comodín usada cuando la categoría de
-- afectación no es "Soporte Técnico (Internet / Pley)", o cuando el soporte
-- no corresponde a ninguna oficina/localidad real.
--
-- Segura de correr en una base ya en producción: usa INSERT OR IGNORE,
-- así que si ya existe una oficina con ese nombre exacto no la duplica
-- (la tabla "oficinas" ya tiene UNIQUE(nombre)).
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_002_oficina_comodin.sql

INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, activo)
VALUES ('SOP', '1. Soporte técnico, pero no aplica', NULL, NULL, 1);
