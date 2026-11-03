-- Migración 042: mapa de clientes por OLT / tarjeta / puerto (alimenta el Reporte General de Clientes, Informe 2).
-- Cada ONU de un archivo de SmartOLT (en cualquier estado) que cruza con Grafana queda aquí, esté o no en una falla.
-- Se ejecuta UNA sola vez, ANTES de subir el código:
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_042_mapa_clientes.sql

CREATE TABLE IF NOT EXISTS clientes_olt (
  clave TEXT PRIMARY KEY,            -- serial normalizado de la ONU (o C-<cuenta> si la ONU no trae serial)
  sn_norm TEXT,
  cuenta TEXT NOT NULL,
  olt TEXT NOT NULL,
  tarjeta INTEGER,
  puerto INTEGER,
  onu_num TEXT,
  estado_onu TEXT,                   -- último estado visto en SmartOLT
  visto TEXT,                        -- hora de Caracas de la última auditoría/ticket donde apareció
  nombre TEXT,
  telefono_casa TEXT,
  telefono_oficina TEXT,
  correo TEXT,
  sector TEXT,
  direccion TEXT,
  municipio TEXT,
  parroquia TEXT,
  estado_contrato TEXT,
  sucursal TEXT
);
CREATE INDEX IF NOT EXISTS idx_colt_olt ON clientes_olt (olt, tarjeta, puerto);

-- Contador por OLT (para listar oficinas y OLTs sin recorrer toda la tabla)
CREATE TABLE IF NOT EXISTS olt_conteo (
  olt TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);

-- Relleno con lo que ya hay: auditorías cruzadas (la más reciente de cada cliente) y ONUs de tickets cruzadas
INSERT OR IGNORE INTO clientes_olt (clave, sn_norm, cuenta, olt, tarjeta, puerto, onu_num, estado_onu, visto, nombre, telefono_casa, telefono_oficina, sector, direccion, estado_contrato, sucursal)
SELECT COALESCE(sn_norm, 'C-' || cuenta), sn_norm, cuenta, olt_nombre, tarjeta, puerto, onu_num, status, fecha_auditoria_local,
       cli_nombre, COALESCE(cli_tel_casa, cli_telefono), cli_tel_oficina, cli_sector, direccion_smartolt, cli_estado_contrato, cli_sucursal
  FROM (SELECT o.*, a.fecha_auditoria_local,
               ROW_NUMBER() OVER (PARTITION BY COALESCE(o.sn_norm, o.cuenta) ORDER BY o.auditoria_id DESC) AS rn
          FROM auditoria_onus o JOIN auditorias a ON a.id = o.auditoria_id WHERE o.cuenta IS NOT NULL)
 WHERE rn = 1;

INSERT OR IGNORE INTO clientes_olt (clave, sn_norm, cuenta, olt, tarjeta, puerto, estado_onu, visto, nombre, telefono_casa, telefono_oficina, correo, sector, direccion, municipio, parroquia, estado_contrato, sucursal)
SELECT COALESCE(NULLIF(serial, ''), 'C-' || cli_cuenta), NULLIF(serial, ''), cli_cuenta, olt,
       CAST(REPLACE(tarjeta, 'Tarjeta ', '') AS INTEGER), CAST(REPLACE(puerto, 'Puerto ', '') AS INTEGER), estado, creado_en,
       cli_nombre, cli_tel_casa, cli_tel_oficina, cli_correo, cli_sector, COALESCE(cli_direccion, direccion), cli_municipio, cli_parroquia, cli_estado_contrato, cli_sucursal
  FROM ticket_onus WHERE cli_cuenta IS NOT NULL AND olt IS NOT NULL;

DELETE FROM olt_conteo;
INSERT INTO olt_conteo (olt, n) SELECT olt, COUNT(*) FROM clientes_olt GROUP BY olt;
