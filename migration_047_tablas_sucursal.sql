-- Migración 047: una tabla de clientes por sucursal (la base de Grafana se reparte por sucursal; la llave de cada tabla es el número de cuenta/contrato).
-- Las tablas las crea la app al cargar el primer archivo de cada sucursal (cb_<sucursal>). Esta migración solo crea el registro.
-- Se ejecuta UNA sola vez, ANTES de subir el código:
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_047_tablas_sucursal.sql

CREATE TABLE IF NOT EXISTS sucursal_tablas (
  sucursal TEXT PRIMARY KEY,     -- tal como viene en el archivo de Grafana (ej. CARACAS 2)
  tabla    TEXT NOT NULL UNIQUE, -- cb_caracas_2
  listo    INTEGER NOT NULL DEFAULT 0,   -- 1 cuando ya se terminó de cargar la sucursal en esta tabla (desde ahí se deja de usar la tabla vieja para ella)
  creado   TEXT
) WITHOUT ROWID;
