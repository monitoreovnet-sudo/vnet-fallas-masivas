-- Solución por registro (Modificar / Cerrar Ticket → "Solución de Ticket", masiva o puntual).
-- Cada registro (OLT/tarjeta/puerto) guarda su propia fecha de solución, para que una solución masiva
-- no sobrescriba la de los registros que ya se habían resuelto de forma puntual.
-- Los tickets.fecha_solucion_* siguen siendo la fecha de solución del TICKET (la que usan los informes).
ALTER TABLE ticket_puertos ADD COLUMN fecha_solucion_cmr TEXT;
ALTER TABLE ticket_puertos ADD COLUMN fecha_solucion_cda TEXT;

SELECT COUNT(*) AS registros FROM ticket_puertos;
