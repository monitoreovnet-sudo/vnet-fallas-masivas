-- ============================================================
-- Registro y Monitoreo de Fallas Masivas CDA - Esquema D1
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Catálogos ----------

CREATE TABLE IF NOT EXISTS oficinas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,              -- ej. BNO
  nombre TEXT NOT NULL UNIQUE,       -- ej. "BNO - BOCONO"
  estado TEXT,                       -- provincia/estado
  localidad TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS olts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oficina_id INTEGER REFERENCES oficinas(id),
  codigo TEXT NOT NULL UNIQUE,       -- ej. BNO-OL-ZT-AC-001
  num_tarjetas INTEGER NOT NULL DEFAULT 17,
  puertos_por_tarjeta INTEGER NOT NULL DEFAULT 16,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS catalogo_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_afectaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id INTEGER REFERENCES catalogo_categorias(id),
  nombre TEXT NOT NULL,
  orden INTEGER DEFAULT 0,
  UNIQUE(categoria_id, nombre)
);

CREATE TABLE IF NOT EXISTS catalogo_comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_unidades_resolutorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_estados_ticket (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalogo_estados_puerto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER DEFAULT 0
);

-- ---------- Usuarios (para trazabilidad del log; el control de acceso
--            por correo corporativo se añadirá más adelante) ----------

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT,
  rol TEXT NOT NULL DEFAULT 'operador',   -- operador | admin
  activo INTEGER NOT NULL DEFAULT 1
);

-- ---------- Tickets ----------

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_crm TEXT NOT NULL UNIQUE,        -- "Ticket CRM-COR"
  tickets_vinculados TEXT,
  fecha_apertura_cda TEXT,                -- ISO 8601
  fecha_apertura_crm TEXT,
  estado_ticket TEXT NOT NULL DEFAULT 'EN CURSO (ASIGNADO)',
  unidad_resolutoria TEXT,
  categoria_afectacion TEXT,
  afectacion TEXT,
  comentario TEXT,
  descripcion TEXT,
  avance_cmr TEXT,
  oficina_id INTEGER REFERENCES oficinas(id),
  fecha_solucion_crm TEXT,
  fecha_solucion_cda TEXT,
  creado_por TEXT,
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado_ticket);
CREATE INDEX IF NOT EXISTS idx_tickets_oficina ON tickets(oficina_id);
CREATE INDEX IF NOT EXISTS idx_tickets_crm ON tickets(ticket_crm);

-- ---------- Detalle OLT / Tarjeta / Puerto por ticket ----------

CREATE TABLE IF NOT EXISTS ticket_puertos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  olt TEXT NOT NULL,                      -- código OLT, o "TODAS"
  tarjeta TEXT NOT NULL,                  -- "Tarjeta N" / "TODAS" / "NODO" / "ENLACE"
  puerto TEXT NOT NULL,                   -- "Puerto N" / "TODOS" / "DESCONOCIDO"
  sector TEXT NOT NULL DEFAULT 'DESCONOCIDO',
  edificio TEXT NOT NULL DEFAULT 'DESCONOCIDO',
  no_clientes_reportaron INTEGER NOT NULL DEFAULT 0,
  nro_clientes_afectados INTEGER NOT NULL DEFAULT 0,
  estado_puerto TEXT NOT NULL DEFAULT 'EN CURSO (ASIGNADO)',
  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_puertos_ticket ON ticket_puertos(ticket_id);

-- ---------- Log de cambios ----------

CREATE TABLE IF NOT EXISTS ticket_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  ticket_puerto_id INTEGER REFERENCES ticket_puertos(id) ON DELETE SET NULL,
  tipo_cambio TEXT NOT NULL,              -- creacion | masivo | puerto | cierre
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  usuario_email TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_log_ticket ON ticket_log(ticket_id);
