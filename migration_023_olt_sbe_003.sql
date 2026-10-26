-- Agrega el OLT SBE-OL-ZT-AC-003 a la lista de OLT de San Bernardino (SBE).
-- Idempotente: si ya existía lo reactiva y lo enlaza a SBE.
INSERT OR IGNORE INTO olts (oficina_id, codigo) VALUES ((SELECT id FROM oficinas WHERE codigo = 'SBE' LIMIT 1), 'SBE-OL-ZT-AC-003');
UPDATE olts SET activo = 1, oficina_id = (SELECT id FROM oficinas WHERE codigo = 'SBE' LIMIT 1) WHERE codigo = 'SBE-OL-ZT-AC-003';

SELECT o.codigo, f.nombre AS oficina, o.activo FROM olts o LEFT JOIN oficinas f ON f.id = o.oficina_id WHERE o.codigo LIKE 'SBE-%' ORDER BY o.codigo;
