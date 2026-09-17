-- Migración 003: elimina el estado redundante "CIERRE DEL TICKET".
-- El único estado de cierre válido es "CERRADO"; los otros 3 estados son
-- "EN CURSO (ASIGNADO)", "EN OBSERVACIÓN" y "VENTANA DE MANTENIMIENTO".
--
-- Segura de correr en una base ya en producción:
--   1) Primero migra cualquier ticket que haya quedado con el estado viejo.
--   2) Luego corrige el catálogo (quita el estado viejo, agrega el que faltaba).
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_003_fix_estado_cerrado.sql

UPDATE tickets SET estado_ticket = 'CERRADO' WHERE estado_ticket = 'CIERRE DEL TICKET';

DELETE FROM catalogo_estados_ticket WHERE nombre = 'CIERRE DEL TICKET';

INSERT OR IGNORE INTO catalogo_estados_ticket (nombre, orden) VALUES ('VENTANA DE MANTENIMIENTO', 4);

-- Reordena para que quede: En Curso (Asignado), En Observación, Cerrado, Ventana de Mantenimiento
UPDATE catalogo_estados_ticket SET orden = 1 WHERE nombre = 'EN CURSO (ASIGNADO)';
UPDATE catalogo_estados_ticket SET orden = 2 WHERE nombre = 'EN OBSERVACIÓN';
UPDATE catalogo_estados_ticket SET orden = 3 WHERE nombre = 'CERRADO';
UPDATE catalogo_estados_ticket SET orden = 4 WHERE nombre = 'VENTANA DE MANTENIMIENTO';
