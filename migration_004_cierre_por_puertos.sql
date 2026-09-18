-- Migración 004: soporta el Escenario 4 ("Cierre por Puertos") de la
-- pantalla unificada Modificar/Cerrar Ticket.
-- Agrega fecha de cierre CRM/CDA a nivel de puerto (independiente de la
-- fecha de cierre a nivel de ticket) y el estado "CERRADO" para puertos.
--
-- Segura de correr en una base ya en producción.
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_004_cierre_por_puertos.sql

ALTER TABLE ticket_puertos ADD COLUMN fecha_cierre_crm TEXT;
ALTER TABLE ticket_puertos ADD COLUMN fecha_cierre_cda TEXT;

INSERT OR IGNORE INTO catalogo_estados_puerto (nombre, orden) VALUES ('CERRADO', 5);
