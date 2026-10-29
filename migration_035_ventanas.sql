-- Migración 035: Ventanas de mantenimiento cargadas desde el Repositorio (Excel "Ficha Resumen Comité").
-- Cada archivo nuevo REEMPLAZA al anterior (solo queda el último). Se ejecuta UNA sola vez:
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_035_ventanas.sql

CREATE TABLE IF NOT EXISTS ventanas_carga (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subido_en TEXT NOT NULL,          -- hora de Caracas "AAAA-MM-DDTHH:MM"
  subido_por TEXT,
  nombre_archivo TEXT,
  titulo TEXT,
  total_hojas INTEGER DEFAULT 1,
  archivo_b64 TEXT                  -- el archivo original, para "Descargar archivo"
);

CREATE TABLE IF NOT EXISTS ventanas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carga_id INTEGER NOT NULL,
  orden INTEGER,
  ticket TEXT NOT NULL,             -- "ID del Cambio" (solo dígitos)
  descripcion TEXT,
  resumen TEXT,
  fecha_inicio TEXT,                -- "AAAA-MM-DDTHH:MM"
  fecha_fin TEXT,
  impacto TEXT,
  afecta_servicio TEXT,
  tipo_afectacion TEXT,
  tiempo_afectacion TEXT,
  servicios_afectados TEXT,
  localidad TEXT,
  unidad_solicitante TEXT,
  responsable TEXT,
  aprobacion TEXT,
  observaciones TEXT
);
CREATE INDEX IF NOT EXISTS idx_ventanas_carga ON ventanas (carga_id);
