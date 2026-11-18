-- Migración 050: clientes afectados por registro de ticket, GUARDADOS (antes se recalculaban en cada consulta de un informe).
-- Solo se recalculan los tickets que cambian (al asociar una auditoría de SmartOLT, editar el ticket o eliminar registros).
-- La primera consulta después de subir el código llena sola los tickets que ya existen (una sola vez).
-- Se ejecuta UNA sola vez, ANTES de subir el código:
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_050_conteo_clientes.sql

CREATE TABLE IF NOT EXISTS ticket_clientes_conteo (
  ticket_puerto_id INTEGER PRIMARY KEY REFERENCES ticket_puertos(id) ON DELETE CASCADE,
  ticket_id INTEGER NOT NULL,
  falla INTEGER NOT NULL DEFAULT 0,
  sin_luz INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tcc_ticket ON ticket_clientes_conteo(ticket_id);

INSERT OR IGNORE INTO parametros_cruce (clave, valor, descripcion) VALUES
  ('conteos_clientes_listo', '0', 'Interno: 1 cuando ya se llenó el conteo guardado de clientes afectados por registro');
