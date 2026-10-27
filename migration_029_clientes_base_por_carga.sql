-- Migración 029 (Paso 2): la base de clientes se identifica por (carga, cuenta), no solo por cuenta.
-- Así la carga nueva de una sucursal se escribe completa ANTES de reemplazar a la anterior,
-- y la base nunca queda a medias si falla la subida.
-- Ejecutar ANTES de subir la primera base (la tabla está vacía; si ya tuviera datos, se perderían).
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_029_clientes_base_por_carga.sql

DROP TABLE IF EXISTS clientes_base;

CREATE TABLE clientes_base (
  carga_id INTEGER NOT NULL REFERENCES cargas_base(id),
  cuenta TEXT NOT NULL,                  -- Numero de Cuenta
  estado_contrato TEXT,                  -- Activo | Suspendido | Prospecto
  fecha_creacion TEXT,
  sucursal TEXT NOT NULL,
  cedula TEXT,
  cedula_norm TEXT,                      -- letra + 9 dígitos
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
  plan TEXT,
  PRIMARY KEY (carga_id, cuenta)
);
CREATE INDEX idx_cb_cuenta   ON clientes_base(cuenta);
CREATE INDEX idx_cb_serial   ON clientes_base(serial_norm);
CREATE INDEX idx_cb_cedula   ON clientes_base(cedula_norm);
CREATE INDEX idx_cb_nombre   ON clientes_base(nombre_norm);
CREATE INDEX idx_cb_sucursal ON clientes_base(sucursal);
