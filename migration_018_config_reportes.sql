-- Generador de reportes: configuración de columnas (orden, visibilidad, ancho, tipografía) por informe.
-- Idempotente: se puede ejecutar más de una vez.
CREATE TABLE IF NOT EXISTS config_reportes (
  reporte TEXT PRIMARY KEY,            -- 'piz' (Pizarra de Monitoreo) | 'rep' (Reporte Diario)
  config TEXT NOT NULL,                -- JSON: { version, columnas: [ {id, visible, titulo, ancho, fontSize, negrita, cursiva, subrayado} ] }
  actualizado_por TEXT,
  actualizado_en TEXT
);
