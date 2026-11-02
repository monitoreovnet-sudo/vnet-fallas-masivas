-- Desde ahora la base guarda las fechas de creación / modificación / log en HORA DE CARACAS (UTC-4), formato "AAAA-MM-DD HH:MM:SS".
-- IMPORTANTE: ejecutar UNA SOLA VEZ, antes de subir el código. Tiene un seguro: si se corre otra vez, no vuelve a restar horas.

CREATE TABLE IF NOT EXISTS tickets_eliminados (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_cmr TEXT NOT NULL, categoria_afectacion TEXT, estado_ticket TEXT,
  num_registros INTEGER NOT NULL DEFAULT 0, eliminado_por TEXT NOT NULL, eliminado_en TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS registros_eliminados (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_cmr TEXT NOT NULL, registro_id INTEGER, oficina TEXT,
  olt TEXT, tarjeta TEXT, puerto TEXT, sector TEXT, edificio TEXT,
  nro_clientes_afectados INTEGER, no_clientes_reportaron INTEGER, estado_puerto TEXT,
  eliminado_por TEXT NOT NULL, eliminado_en TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS migracion_hora_caracas (aplicada_en TEXT);

-- Corrección única de lo ya guardado (UTC -> Caracas)
UPDATE tickets SET creado_en = datetime(creado_en, '-4 hours'), actualizado_en = datetime(actualizado_en, '-4 hours')
  WHERE NOT EXISTS (SELECT 1 FROM migracion_hora_caracas);
UPDATE ticket_puertos SET creado_en = datetime(creado_en, '-4 hours'), actualizado_en = datetime(actualizado_en, '-4 hours')
  WHERE NOT EXISTS (SELECT 1 FROM migracion_hora_caracas);
UPDATE ticket_log SET fecha = datetime(fecha, '-4 hours')
  WHERE NOT EXISTS (SELECT 1 FROM migracion_hora_caracas);
UPDATE ticket_onus SET creado_en = datetime(creado_en, '-4 hours'), cruce_fecha = CASE WHEN cruce_fecha IS NULL THEN NULL ELSE datetime(cruce_fecha, '-4 hours') END
  WHERE NOT EXISTS (SELECT 1 FROM migracion_hora_caracas);
UPDATE tickets_eliminados SET eliminado_en = datetime(eliminado_en, '-4 hours')
  WHERE NOT EXISTS (SELECT 1 FROM migracion_hora_caracas);
UPDATE registros_eliminados SET eliminado_en = datetime(eliminado_en, '-4 hours')
  WHERE NOT EXISTS (SELECT 1 FROM migracion_hora_caracas);

INSERT INTO migracion_hora_caracas (aplicada_en) SELECT datetime('now', '-4 hours') WHERE NOT EXISTS (SELECT 1 FROM migracion_hora_caracas);

-- Lo que se inserte de ahora en adelante queda en hora de Caracas (los valores por defecto de las tablas eran UTC)
CREATE TRIGGER IF NOT EXISTS trg_tickets_hora_caracas AFTER INSERT ON tickets
BEGIN
  UPDATE tickets SET creado_en = datetime('now', '-4 hours'), actualizado_en = datetime('now', '-4 hours') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_ticket_puertos_hora_caracas AFTER INSERT ON ticket_puertos
BEGIN
  UPDATE ticket_puertos SET creado_en = datetime('now', '-4 hours'), actualizado_en = datetime('now', '-4 hours') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_ticket_log_hora_caracas AFTER INSERT ON ticket_log
BEGIN
  UPDATE ticket_log SET fecha = datetime('now', '-4 hours') WHERE id = NEW.id;
END;
