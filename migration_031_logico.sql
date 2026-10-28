-- "SOPORTE TÉCNICO PERO NO APLICA" pasa a llamarse "LÓGICO" (los tickets que ya la usan siguen apuntando a la misma oficina).
UPDATE oficinas SET nombre = 'LÓGICO' WHERE nombre = 'SOPORTE TÉCNICO PERO NO APLICA';
SELECT id, codigo, nombre, tipo FROM oficinas WHERE nombre = 'LÓGICO';
