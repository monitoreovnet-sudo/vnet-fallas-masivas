-- Migración 028: equivalencias de prefijo entre códigos de OLT que hoy conviven por cambio de nombre.
-- El cruce con SmartOLT trata ambos códigos como la MISMA OLT (ej. CRC-OL-ZT-AC-001 = CRP-OL-ZT-AC-001).
-- Para sumar otra equivalencia basta agregar una fila (prefijo_alterno -> prefijo_canonico).
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_028_olt_equivalencias.sql

CREATE TABLE IF NOT EXISTS olt_equivalencias (
  prefijo_alterno TEXT PRIMARY KEY,
  prefijo_canonico TEXT NOT NULL,
  nota TEXT
);

INSERT OR IGNORE INTO olt_equivalencias (prefijo_alterno, prefijo_canonico, nota) VALUES
  ('CRC', 'CRP', 'Carúpano'),
  ('ESB', 'ESM', 'El Sombrero'),
  ('SPS', 'SCP', 'Socopó'),
  ('STS', 'STB', 'Santa Bárbara de Barinas');
