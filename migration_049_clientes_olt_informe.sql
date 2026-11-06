-- Migración 049: informe «Clientes por OLT». El mapa de clientes guarda además cédula, estado (geográfico) y ubicación (zona/dirección de SmartOLT).
-- Se ejecuta UNA sola vez, ANTES de subir el código:
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_049_clientes_olt_informe.sql

ALTER TABLE clientes_olt ADD COLUMN cedula TEXT;
ALTER TABLE clientes_olt ADD COLUMN estado_geo TEXT;
ALTER TABLE clientes_olt ADD COLUMN ubicacion TEXT;
