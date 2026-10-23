-- Fecha de la Falla: momento en que realmente comenzó la falla (puede ser distinto de la hora en que CDA y CMR la detectan).
-- Campo del TICKET, junto a las fechas de apertura del CMR y del CDA. No se usa en los informes por defecto.
ALTER TABLE tickets ADD COLUMN fecha_falla TEXT;

SELECT COUNT(*) AS tickets FROM tickets;
