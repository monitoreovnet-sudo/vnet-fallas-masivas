-- Contador integral de escrituras de D1 por día (día UTC = el día de Cloudflare). Una fila por día y origen.
CREATE TABLE IF NOT EXISTS uso_d1 (
  dia    TEXT NOT NULL,
  origen TEXT NOT NULL,
  filas  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, origen)
) WITHOUT ROWID;
