-- Migración 019: estandariza a "N/A" la ubicación de las 5 oficinas especiales sin ubicación física:
-- "1. Soporte Técnico pero no aplica", CENTRAL TELEFÓNICA, HERRAMIENTAS VNET, MERCADEO, PAGOS.
-- (ENLACE, TRAMO y TRONCAL NO se tocan.) Idempotente.

-- 1) Catálogo: localidad y estado = 'N/A'
UPDATE oficinas SET estado = 'N/A', localidad = 'N/A'
WHERE tipo = 'especial'
  AND nombre IN ('1. Soporte Técnico pero no aplica','CENTRAL TELEFÓNICA','HERRAMIENTAS VNET','MERCADEO','PAGOS');

-- 2) Datos históricos: olt, tarjeta, puerto, sector, edificio = 'N/A'
UPDATE ticket_puertos
SET olt = 'N/A', tarjeta = 'N/A', puerto = 'N/A', sector = 'N/A', edificio = 'N/A'
WHERE oficina_id IN (
  SELECT id FROM oficinas
  WHERE tipo = 'especial'
    AND nombre IN ('1. Soporte Técnico pero no aplica','CENTRAL TELEFÓNICA','HERRAMIENTAS VNET','MERCADEO','PAGOS')
)
AND (olt <> 'N/A' OR tarjeta <> 'N/A' OR puerto <> 'N/A' OR sector <> 'N/A' OR edificio <> 'N/A');

-- 3) Verificación (debe devolver 0 filas)
SELECT o.nombre, p.id, p.olt, p.tarjeta, p.puerto, p.sector, p.edificio
FROM ticket_puertos p JOIN oficinas o ON o.id = p.oficina_id
WHERE o.nombre IN ('1. Soporte Técnico pero no aplica','CENTRAL TELEFÓNICA','HERRAMIENTAS VNET','MERCADEO','PAGOS')
  AND (o.estado <> 'N/A' OR o.localidad <> 'N/A' OR p.olt <> 'N/A' OR p.tarjeta <> 'N/A' OR p.puerto <> 'N/A' OR p.sector <> 'N/A' OR p.edificio <> 'N/A');
