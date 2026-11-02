-- Migración 036: la base de clientes (Grafana) pasa a ser ACUMULATIVA.
--  * Una sola tabla sin "rowid", con llave = serial de la ONU (o "SIN-SN-<cuenta>" si la cuenta no tiene serial).
--    Cada cliente nuevo cuesta 1 sola escritura en D1 (antes eran 7), para poder cargarla con el plan gratuito.
--  * Ya no se reemplaza la sucursal completa: cada carga agrega los clientes nuevos (y si una ONU pasó a otro cliente, la actualiza).
--  * Lo que ya estaba cargado se conserva.
-- Se ejecuta UNA sola vez (si dice "duplicate column name" ya estaba aplicada):
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_036_base_acumulada.sql

ALTER TABLE cargas_base ADD COLUMN nuevas INTEGER DEFAULT 0;
ALTER TABLE cargas_base ADD COLUMN cambiadas INTEGER DEFAULT 0;
ALTER TABLE cargas_base ADD COLUMN existentes INTEGER DEFAULT 0;
ALTER TABLE cargas_base ADD COLUMN total_acum INTEGER DEFAULT 0;   -- cuentas acumuladas de la sucursal después de esta carga

ALTER TABLE clientes_base RENAME TO clientes_base_old;

CREATE TABLE clientes_base (
  clave TEXT PRIMARY KEY,                -- serial normalizado, o SIN-SN-<cuenta>
  carga_id INTEGER,                      -- última carga que escribió la fila
  cuenta TEXT NOT NULL,
  estado_contrato TEXT,
  fecha_creacion TEXT,
  sucursal TEXT NOT NULL,
  cedula TEXT,
  cedula_norm TEXT,
  tipo_cliente TEXT,
  nombre TEXT,
  nombre_norm TEXT,
  genero TEXT,
  telefono_casa TEXT,
  telefono_oficina TEXT,
  correo TEXT,
  correo_iptv TEXT,
  serial_onu TEXT,
  serial_norm TEXT,
  estado_geo TEXT,
  direccion TEXT,
  municipio TEXT,
  parroquia TEXT,
  sector TEXT,
  sector_norm TEXT,
  plan TEXT
) WITHOUT ROWID;

INSERT OR REPLACE INTO clientes_base (clave, carga_id, cuenta, estado_contrato, fecha_creacion, sucursal, cedula, cedula_norm, tipo_cliente,
    nombre, nombre_norm, genero, telefono_casa, telefono_oficina, correo, correo_iptv, serial_onu, serial_norm,
    estado_geo, direccion, municipio, parroquia, sector, sector_norm, plan)
  SELECT COALESCE(serial_norm, 'SIN-SN-' || cuenta), carga_id, cuenta, estado_contrato, fecha_creacion, sucursal, cedula, cedula_norm, tipo_cliente,
    nombre, nombre_norm, genero, telefono_casa, telefono_oficina, correo, correo_iptv, serial_onu, serial_norm,
    estado_geo, direccion, municipio, parroquia, sector, sector_norm, plan
  FROM clientes_base_old
  WHERE carga_id IN (SELECT id FROM cargas_base WHERE estado = 'vigente');

UPDATE cargas_base SET total_acum = filas_leidas - filas_descartadas, nuevas = filas_leidas - filas_descartadas WHERE estado = 'vigente';

DROP TABLE clientes_base_old;
