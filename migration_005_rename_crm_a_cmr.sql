-- Migración 005: "CRM" fue un error de tipeo — el campo correcto es "CMR".
-- Renombra las columnas afectadas sin perder datos (ALTER TABLE RENAME COLUMN
-- conserva el contenido).
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_005_rename_crm_a_cmr.sql

ALTER TABLE tickets RENAME COLUMN ticket_crm TO ticket_cmr;
ALTER TABLE tickets RENAME COLUMN fecha_apertura_crm TO fecha_apertura_cmr;
ALTER TABLE tickets RENAME COLUMN fecha_solucion_crm TO fecha_solucion_cmr;
ALTER TABLE ticket_puertos RENAME COLUMN fecha_cierre_crm TO fecha_cierre_cmr;

-- El índice viejo apuntaba al nombre de columna anterior; se recrea con el nuevo nombre.
DROP INDEX IF EXISTS idx_tickets_crm;
CREATE INDEX IF NOT EXISTS idx_tickets_cmr ON tickets(ticket_cmr);
