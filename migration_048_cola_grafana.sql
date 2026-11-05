-- Migración 048: cola nocturna de Grafana.
-- El archivo de Grafana se sube una vez (de día); la app lo guarda comprimido en trozos y lo va aplicando de noche
-- (12:00 am de Caracas) hasta un máximo de cambios por noche, sin pasar el límite diario de D1.
-- Se ejecuta UNA sola vez, ANTES de subir el código:
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_048_cola_grafana.sql

ALTER TABLE cargas_base ADD COLUMN en_cola INTEGER DEFAULT 0;   -- 1 = carga hecha por la cola nocturna (sus escrituras se cuentan el día en que se aplican)

CREATE TABLE IF NOT EXISTS cola_cargas (
  carga_id      INTEGER PRIMARY KEY REFERENCES cargas_base(id),
  estado        TEXT NOT NULL DEFAULT 'subiendo',   -- subiendo | pendiente | espera_confirmacion | lista | error | cancelada
  total_chunks  INTEGER NOT NULL DEFAULT 0,
  sig           INTEGER NOT NULL DEFAULT 0,          -- siguiente trozo por aplicar
  cuentas_chunks INTEGER NOT NULL DEFAULT 0,
  completa      INTEGER NOT NULL DEFAULT 0,
  filas         INTEGER NOT NULL DEFAULT 0,          -- filas del archivo para esta sucursal
  nuevas        INTEGER NOT NULL DEFAULT 0,
  cambiadas     INTEGER NOT NULL DEFAULT 0,
  existentes    INTEGER NOT NULL DEFAULT 0,
  bajas         INTEGER,                              -- se llena cuando espera confirmación o termina
  total_base    INTEGER,
  confirmar     INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  usuario       TEXT,
  creado        TEXT DEFAULT (datetime('now')),
  actualizado   TEXT
);

CREATE TABLE IF NOT EXISTS cola_grafana (
  carga_id INTEGER NOT NULL,
  tipo     TEXT NOT NULL,       -- 'filas' | 'cuentas'
  seq      INTEGER NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  datos    TEXT NOT NULL,       -- JSON comprimido (gzip) en base64
  PRIMARY KEY (carga_id, tipo, seq)
) WITHOUT ROWID;
