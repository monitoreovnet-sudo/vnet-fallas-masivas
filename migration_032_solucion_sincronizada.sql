-- Migración 032: Fecha de SOLUCIÓN como base del tiempo de afectación, y sincronía CMR ↔ CDA, para los datos que ya existen.
-- Solo se rellenan fechas VACÍAS; nunca se pisa una fecha que ya está escrita.

-- 1) Tickets cerrados que nunca tuvieron fecha de solución: la solución toma la fecha de cierre de sus registros (así su tiempo no cambia).
UPDATE tickets SET fecha_solucion_cmr = (SELECT MAX(p.fecha_cierre_cmr) FROM ticket_puertos p WHERE p.ticket_id = tickets.id AND p.fecha_cierre_cmr IS NOT NULL AND TRIM(p.fecha_cierre_cmr) <> '')
 WHERE estado_ticket = 'CERRADO' AND (fecha_solucion_cmr IS NULL OR TRIM(fecha_solucion_cmr) = '');
UPDATE tickets SET fecha_solucion_cda = (SELECT MAX(p.fecha_cierre_cda) FROM ticket_puertos p WHERE p.ticket_id = tickets.id AND p.fecha_cierre_cda IS NOT NULL AND TRIM(p.fecha_cierre_cda) <> '')
 WHERE estado_ticket = 'CERRADO' AND (fecha_solucion_cda IS NULL OR TRIM(fecha_solucion_cda) = '');
UPDATE ticket_puertos SET fecha_solucion_cmr = fecha_cierre_cmr
 WHERE (fecha_solucion_cmr IS NULL OR TRIM(fecha_solucion_cmr) = '') AND fecha_cierre_cmr IS NOT NULL AND TRIM(fecha_cierre_cmr) <> '';
UPDATE ticket_puertos SET fecha_solucion_cda = fecha_cierre_cda
 WHERE (fecha_solucion_cda IS NULL OR TRIM(fecha_solucion_cda) = '') AND fecha_cierre_cda IS NOT NULL AND TRIM(fecha_cierre_cda) <> '';

-- 2) Si la solución está llena en uno solo (CMR o CDA), se duplica en el otro.
UPDATE tickets SET fecha_solucion_cda = fecha_solucion_cmr
 WHERE (fecha_solucion_cda IS NULL OR TRIM(fecha_solucion_cda) = '') AND fecha_solucion_cmr IS NOT NULL AND TRIM(fecha_solucion_cmr) <> '';
UPDATE tickets SET fecha_solucion_cmr = fecha_solucion_cda
 WHERE (fecha_solucion_cmr IS NULL OR TRIM(fecha_solucion_cmr) = '') AND fecha_solucion_cda IS NOT NULL AND TRIM(fecha_solucion_cda) <> '';
UPDATE ticket_puertos SET fecha_solucion_cda = fecha_solucion_cmr
 WHERE (fecha_solucion_cda IS NULL OR TRIM(fecha_solucion_cda) = '') AND fecha_solucion_cmr IS NOT NULL AND TRIM(fecha_solucion_cmr) <> '';
UPDATE ticket_puertos SET fecha_solucion_cmr = fecha_solucion_cda
 WHERE (fecha_solucion_cmr IS NULL OR TRIM(fecha_solucion_cmr) = '') AND fecha_solucion_cda IS NOT NULL AND TRIM(fecha_solucion_cda) <> '';
