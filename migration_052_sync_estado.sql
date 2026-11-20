-- Huella de sincronización de la Pizarra.
-- Ejecutar una sola vez en D1 antes de desplegar el código que consulta /api/cambios.
-- Los triggers cubren cambios que afectan los datos visibles de la Pizarra,
-- independientemente del endpoint que los origine.

CREATE TABLE IF NOT EXISTS sync_estado (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 1,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now', '-4 hours'))
);

INSERT OR IGNORE INTO sync_estado (id, version, actualizado_en)
VALUES (1, 1, datetime('now', '-4 hours'));

-- Tickets: altas, cambios de campos visibles y eliminaciones.
CREATE TRIGGER IF NOT EXISTS trg_sync_tickets_insert
AFTER INSERT ON tickets
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_tickets_update
AFTER UPDATE ON tickets
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_tickets_delete
AFTER DELETE ON tickets
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

-- Puertos: altas, cambios (incluidos los conteos de clientes afectados) y bajas.
CREATE TRIGGER IF NOT EXISTS trg_sync_ticket_puertos_insert
AFTER INSERT ON ticket_puertos
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_ticket_puertos_update
AFTER UPDATE ON ticket_puertos
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_ticket_puertos_delete
AFTER DELETE ON ticket_puertos
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

-- La Pizarra muestra nombre, estado y localidad de la oficina.
CREATE TRIGGER IF NOT EXISTS trg_sync_oficinas_insert
AFTER INSERT ON oficinas
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_oficinas_update
AFTER UPDATE ON oficinas
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_oficinas_delete
AFTER DELETE ON oficinas
BEGIN
  UPDATE sync_estado
     SET version = version + 1,
         actualizado_en = datetime('now', '-4 hours')
   WHERE id = 1;
END;
