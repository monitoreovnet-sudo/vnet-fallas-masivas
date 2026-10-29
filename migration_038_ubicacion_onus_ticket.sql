-- Migración 038: Ubicación por puerto + ONUs (clientes) registradas al crear el ticket con los archivos de SmartOLT.
-- Se ejecuta UNA sola vez, ANTES de subir el código (si dice "duplicate column name" es que ya se había aplicado):
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_038_ubicacion_onus_ticket.sql

ALTER TABLE ticket_puertos ADD COLUMN ubicacion TEXT;

CREATE TABLE IF NOT EXISTS ticket_onus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  olt TEXT,
  tarjeta TEXT,            -- "Tarjeta 8"
  puerto TEXT,             -- "Puerto 13"
  serial TEXT,             -- serial de la ONU (SN), normalizado
  cuenta TEXT,             -- número de cuenta sacado del campo Name (sin ceros a la izquierda)
  cedula TEXT,             -- cédula/RIF si venía en el Name (letra + 9 dígitos)
  nombre TEXT,
  estado TEXT,             -- estado en SmartOLT (LOS, Power fail...)
  direccion TEXT,
  creado_en TEXT
);
CREATE INDEX IF NOT EXISTS idx_ticket_onus_ticket ON ticket_onus (ticket_id);
