-- Migración 013: agrega "RESUELTO" como estado real de ticket. Se usa cuando
-- el CDA declara el ticket resuelto pero el CMR todavía no lo cierra.
-- Es un estado intermedio: en la pantalla "Modificar/Cerrar Ticket" se
-- gestiona igual que EN CURSO/EN OBSERVACIÓN (Escenarios 1 y 2, <> Cerrado),
-- no como un cierre -- solo pasar a estado_ticket = 'CERRADO' cuenta como
-- Escenario 3/4.
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_013_estado_resuelto.sql

INSERT OR IGNORE INTO catalogo_estados_ticket (nombre, orden) VALUES ('RESUELTO', 4);

-- Reordena para que quede: En Curso Asignado, En Observación, Ventana de
-- Mantenimiento, Resuelto, Cerrado (mismo orden del dashboard).
UPDATE catalogo_estados_ticket SET orden = 1 WHERE nombre = 'EN CURSO (ASIGNADO)';
UPDATE catalogo_estados_ticket SET orden = 2 WHERE nombre = 'EN OBSERVACIÓN';
UPDATE catalogo_estados_ticket SET orden = 3 WHERE nombre = 'VENTANA DE MANTENIMIENTO';
UPDATE catalogo_estados_ticket SET orden = 4 WHERE nombre = 'RESUELTO';
UPDATE catalogo_estados_ticket SET orden = 5 WHERE nombre = 'CERRADO';
