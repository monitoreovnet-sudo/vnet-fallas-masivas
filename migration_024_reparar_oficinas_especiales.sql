-- Migración 024: repara las oficinas ESPECIALES (las que usa Crear Ticket según el Tipo: ENLACE, TRAMO, TRONCAL,
-- CENTRAL TELEFÓNICA, HERRAMIENTAS VNET, MERCADEO, PAGOS y SOPORTE TÉCNICO PERO NO APLICA).
-- Corrige el error "No existe la oficina especial ... en el catálogo": las deja con su nombre exacto, tipo 'especial' y activas,
-- y crea las que falten. Idempotente (se puede ejecutar más de una vez) y no toca los tickets.
UPDATE oficinas SET nombre = 'SOPORTE TÉCNICO PERO NO APLICA', codigo = 'SOP', estado = 'N/A', localidad = 'N/A', tipo = 'especial', activo = 1 WHERE nombre = 'SOPORTE TÉCNICO PERO NO APLICA' COLLATE NOCASE OR codigo = 'SOP';
UPDATE oficinas SET nombre = 'ENLACE', codigo = 'ENLACE', estado = 'ENLACE', localidad = 'ENLACE', tipo = 'especial', activo = 1 WHERE nombre = 'ENLACE' COLLATE NOCASE OR codigo = 'ENLACE';
UPDATE oficinas SET nombre = 'TRAMO', codigo = 'TRAMO', estado = 'TRAMO', localidad = 'TRAMO', tipo = 'especial', activo = 1 WHERE nombre = 'TRAMO' COLLATE NOCASE OR codigo = 'TRAMO';
UPDATE oficinas SET nombre = 'TRONCAL', codigo = 'TRONCAL', estado = 'TRONCAL', localidad = 'TRONCAL', tipo = 'especial', activo = 1 WHERE nombre = 'TRONCAL' COLLATE NOCASE OR codigo = 'TRONCAL';
UPDATE oficinas SET nombre = 'CENTRAL TELEFÓNICA', codigo = 'CENTRAL', estado = 'N/A', localidad = 'N/A', tipo = 'especial', activo = 1 WHERE nombre = 'CENTRAL TELEFÓNICA' COLLATE NOCASE OR codigo = 'CENTRAL';
UPDATE oficinas SET nombre = 'HERRAMIENTAS VNET', codigo = 'HERRAM', estado = 'N/A', localidad = 'N/A', tipo = 'especial', activo = 1 WHERE nombre = 'HERRAMIENTAS VNET' COLLATE NOCASE OR codigo = 'HERRAM';
UPDATE oficinas SET nombre = 'MERCADEO', codigo = 'MERCAD', estado = 'N/A', localidad = 'N/A', tipo = 'especial', activo = 1 WHERE nombre = 'MERCADEO' COLLATE NOCASE OR codigo = 'MERCAD';
UPDATE oficinas SET nombre = 'PAGOS', codigo = 'PAGOS', estado = 'N/A', localidad = 'N/A', tipo = 'especial', activo = 1 WHERE nombre = 'PAGOS' COLLATE NOCASE OR codigo = 'PAGOS';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('SOP', 'SOPORTE TÉCNICO PERO NO APLICA', 'N/A', 'N/A', 'especial', 1);
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('ENLACE', 'ENLACE', 'ENLACE', 'ENLACE', 'especial', 1);
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('TRAMO', 'TRAMO', 'TRAMO', 'TRAMO', 'especial', 1);
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('TRONCAL', 'TRONCAL', 'TRONCAL', 'TRONCAL', 'especial', 1);
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('CENTRAL', 'CENTRAL TELEFÓNICA', 'N/A', 'N/A', 'especial', 1);
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('HERRAM', 'HERRAMIENTAS VNET', 'N/A', 'N/A', 'especial', 1);
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('MERCAD', 'MERCADEO', 'N/A', 'N/A', 'especial', 1);
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo, activo) VALUES ('PAGOS', 'PAGOS', 'N/A', 'N/A', 'especial', 1);

-- Verificación: debe listar las 8 oficinas especiales, todas con tipo = especial y activo = 1
SELECT id, codigo, nombre, tipo, activo FROM oficinas WHERE tipo = 'especial' ORDER BY nombre;
