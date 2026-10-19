-- Migración 016: agrega TRONCAL como oficina especial (junto a ENLACE y TRAMO).
-- Es idempotente: se puede ejecutar más de una vez sin duplicar nada.
UPDATE oficinas SET codigo = 'TRONCAL', estado = 'TRONCAL', localidad = 'TRONCAL', tipo = 'especial', activo = 1 WHERE nombre = 'TRONCAL';
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo) VALUES ('TRONCAL', 'TRONCAL', 'TRONCAL', 'TRONCAL', 'especial');
