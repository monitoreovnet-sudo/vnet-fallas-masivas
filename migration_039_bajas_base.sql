-- Migración 039: la base de clientes por sucursal ahora se REEMPLAZA con cada archivo (solo se escriben las diferencias).
-- Se guarda cuántos clientes se dieron de baja (ya no vienen como Activos) en cada carga.
-- Se ejecuta UNA sola vez (si dice "duplicate column name" ya estaba aplicada):
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_039_bajas_base.sql

ALTER TABLE cargas_base ADD COLUMN bajas INTEGER DEFAULT 0;
