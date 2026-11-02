-- Migración 040: las ONUs de cada ticket (ticket_onus) se cruzan con la base de clientes de Grafana y guardan los datos del cliente.
-- Se ejecuta UNA sola vez (si dice "duplicate column name" ya estaba aplicada):
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_040_cruce_ticket.sql

ALTER TABLE ticket_onus ADD COLUMN cli_cuenta TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_nombre TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_cedula TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_correo TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_correo_iptv TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_tel_casa TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_tel_oficina TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_direccion TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_municipio TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_parroquia TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_sector TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_estado_contrato TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_fecha_contrato TEXT;
ALTER TABLE ticket_onus ADD COLUMN cli_sucursal TEXT;
ALTER TABLE ticket_onus ADD COLUMN cruce_metodo TEXT;        -- serial | cuenta_en_name | cedula_en_name | nombre
ALTER TABLE ticket_onus ADD COLUMN cruce_fecha TEXT;         -- cuándo se cruzó (UTC)
ALTER TABLE ticket_onus ADD COLUMN cruce_base_fecha TEXT;    -- fecha de la base de Grafana usada (hora de Caracas)

CREATE INDEX IF NOT EXISTS idx_ticket_onus_pend ON ticket_onus (cli_cuenta);

-- Días de diferencia permitidos entre las ONUs del ticket y el archivo de Grafana (Paso 2 del cruce por ticket)
INSERT OR IGNORE INTO parametros_cruce (clave, valor, descripcion) VALUES
  ('ventana_ticket_grafana_dias', '2', 'Diferencia máxima (días) entre la carga de las ONUs de un ticket y la fecha del archivo de Grafana para cruzarlas');
