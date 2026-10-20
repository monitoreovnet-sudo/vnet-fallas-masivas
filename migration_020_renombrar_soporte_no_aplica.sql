-- Migración 020: renombra la oficina especial "1. Soporte Técnico pero no aplica" a "SOPORTE TÉCNICO PERO NO APLICA".
-- Los tickets la referencian por id, así que se actualizan solos (no hay que tocar ticket_puertos). Idempotente.
UPDATE oficinas
SET nombre = 'SOPORTE TÉCNICO PERO NO APLICA', estado = 'N/A', localidad = 'N/A', tipo = 'especial', activo = 1
WHERE nombre = '1. Soporte Técnico pero no aplica';

-- Si por algún motivo faltaba, se crea
INSERT OR IGNORE INTO oficinas (codigo, nombre, estado, localidad, tipo)
VALUES ('SOP', 'SOPORTE TÉCNICO PERO NO APLICA', 'N/A', 'N/A', 'especial');

-- Verificación: debe devolver 1 fila y ninguna con el nombre viejo
SELECT id, codigo, nombre, estado, localidad FROM oficinas WHERE nombre LIKE '%pero no aplica%' COLLATE NOCASE;
