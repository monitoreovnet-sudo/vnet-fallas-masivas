-- Migración 051 (Plan B): listas de clientes ya cruzados (exportadas de «Clientes por OLT») ancladas a un ticket.
-- Cada subida es UNA lista nueva con su fecha y hora; la más reciente es la vigente. No se borra ni se compara nada al subir.
-- Se ejecuta UNA sola vez, ANTES de subir el código:
--
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_051_listas_clientes_ticket.sql

CREATE TABLE IF NOT EXISTS ticket_listas_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  archivo TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'cargando',   -- cargando | lista
  aplicada INTEGER NOT NULL DEFAULT 0,       -- 1 si se eligió el número del archivo para el ticket
  subido_por TEXT,
  subido_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tlc_ticket ON ticket_listas_clientes(ticket_id);

CREATE TABLE IF NOT EXISTS ticket_lista_filas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lista_id INTEGER NOT NULL,
  nombre TEXT, telefono TEXT, telefono_oficina TEXT, correo TEXT, contrato TEXT, cedula TEXT,
  sucursal TEXT, estado TEXT, oficina TEXT, olt TEXT, tarjeta TEXT, puerto TEXT, sector TEXT, municipio TEXT,
  direccion TEXT, ubicacion TEXT, estatus_grafana TEXT, estatus_smartolt TEXT, serial TEXT, visto TEXT
);
CREATE INDEX IF NOT EXISTS idx_tlf_lista ON ticket_lista_filas(lista_id);
