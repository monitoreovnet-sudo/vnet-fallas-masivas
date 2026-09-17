-- Migración 001: agrega oficina_id a ticket_puertos
-- Seguro de correr en una base ya en producción: solo agrega una columna
-- nueva (nullable), no borra ni modifica datos existentes.
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_001_oficina_en_puertos.sql

ALTER TABLE ticket_puertos ADD COLUMN oficina_id INTEGER REFERENCES oficinas(id);

CREATE INDEX IF NOT EXISTS idx_puertos_oficina ON ticket_puertos(oficina_id);
