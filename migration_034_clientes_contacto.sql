-- Migración 034 (Paso 6): la copia del cliente que guarda cada ONU auditada ahora incluye los dos teléfonos y la identificación original,
-- para poder armar el Excel del bot aunque la base de Grafana se reemplace después.
-- Se ejecuta UNA sola vez (si dice "duplicate column name" ya estaba aplicada):
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_034_clientes_contacto.sql

ALTER TABLE auditoria_onus ADD COLUMN cli_tel_casa TEXT;
ALTER TABLE auditoria_onus ADD COLUMN cli_tel_oficina TEXT;
ALTER TABLE auditoria_onus ADD COLUMN cli_ident_externo TEXT;

-- Auditorías ya cargadas: se completan con la base que usaron, mientras esa base siga guardada
UPDATE auditoria_onus SET
  cli_tel_casa = (SELECT c.telefono_casa FROM clientes_base c WHERE c.carga_id = auditoria_onus.carga_id AND c.cuenta = auditoria_onus.cuenta),
  cli_tel_oficina = (SELECT c.telefono_oficina FROM clientes_base c WHERE c.carga_id = auditoria_onus.carga_id AND c.cuenta = auditoria_onus.cuenta),
  cli_ident_externo = (SELECT c.cedula FROM clientes_base c WHERE c.carga_id = auditoria_onus.carga_id AND c.cuenta = auditoria_onus.cuenta)
WHERE cuenta IS NOT NULL AND carga_id IS NOT NULL;
