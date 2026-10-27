-- Migración 027 (Paso 1 del módulo "Cruce de Clientes Afectados", SmartOLT × Grafana).
-- Solo crea tablas, índices y parámetros. No toca ninguna tabla existente.
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_027_cruce_clientes.sql
--
-- Convención de fechas: texto "AAAA-MM-DDTHH:MM:SS" en HORA DE CARACAS (igual que los tickets).
-- Las fechas que vienen en UTC se guardan además en su columna *_utc.

-- ---------- Parámetros configurables (Administración) ----------
CREATE TABLE IF NOT EXISTS parametros_cruce (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descripcion TEXT
);
INSERT OR IGNORE INTO parametros_cruce (clave, valor, descripcion) VALUES
  ('margen_caida_previa_horas', '1',  'Sin Fecha de la falla: referencia = Apertura CMR menos estas horas'),
  ('tolerancia_base_horas',     '12', 'Diferencia máxima (horas) entre la base Grafana de la sucursal y la auditoría SmartOLT'),
  ('umbral_alerta_onus',        '1',  'ONUs afectadas en un puerto sin ticket para levantar "Posible falla no reportada"');

-- ---------- Base de clientes (Grafana), una carga por sucursal ----------
CREATE TABLE IF NOT EXISTS cargas_base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sucursal TEXT NOT NULL,
  archivo TEXT,
  fecha_base TEXT,                       -- del nombre del archivo; si no la trae, la hora de subida (Caracas)
  filas_leidas INTEGER NOT NULL DEFAULT 0,
  filas_descartadas INTEGER NOT NULL DEFAULT 0,
  activos INTEGER NOT NULL DEFAULT 0,
  usuario TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- UTC
  estado TEXT NOT NULL DEFAULT 'cargando',         -- cargando | vigente | reemplazada | fallida
  UNIQUE (sucursal, id)
);
CREATE INDEX IF NOT EXISTS idx_cargas_sucursal ON cargas_base(sucursal, estado);

CREATE TABLE IF NOT EXISTS clientes_base (
  cuenta TEXT PRIMARY KEY,               -- Numero de Cuenta
  estado_contrato TEXT,                  -- Activo | Suspendido | Prospecto
  fecha_creacion TEXT,
  sucursal TEXT NOT NULL,
  cedula TEXT,
  cedula_norm TEXT,                      -- letra + 9 dígitos
  tipo_cliente TEXT,
  nombre TEXT,
  nombre_norm TEXT,
  genero TEXT,
  telefono_casa TEXT,
  telefono_oficina TEXT,
  correo TEXT,
  correo_iptv TEXT,
  serial_onu TEXT,
  serial_norm TEXT,
  estado_geo TEXT,
  direccion TEXT,
  municipio TEXT,
  parroquia TEXT,
  sector TEXT,
  sector_norm TEXT,
  plan TEXT,
  carga_id INTEGER REFERENCES cargas_base(id)
);
CREATE INDEX IF NOT EXISTS idx_cb_serial   ON clientes_base(serial_norm);
CREATE INDEX IF NOT EXISTS idx_cb_cedula   ON clientes_base(cedula_norm);
CREATE INDEX IF NOT EXISTS idx_cb_nombre   ON clientes_base(nombre_norm);
CREATE INDEX IF NOT EXISTS idx_cb_sucursal ON clientes_base(sucursal);
CREATE INDEX IF NOT EXISTS idx_cb_carga    ON clientes_base(carga_id);

-- ---------- Auditorías SmartOLT ----------
CREATE TABLE IF NOT EXISTS auditorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archivo TEXT,
  olt_id_smartolt TEXT,
  olt_nombre TEXT NOT NULL,
  tarjeta INTEGER,                       -- NULL = toda la OLT
  puerto INTEGER,                        -- NULL = toda la tarjeta / OLT
  estado_filtro TEXT,
  fecha_auditoria_utc TEXT,
  fecha_auditoria_local TEXT NOT NULL,   -- hora de Caracas, confirmada por el usuario al subir
  usuario TEXT,
  fecha_subida TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- UTC
  total_onus INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_aud_olt ON auditorias(olt_nombre, tarjeta, puerto, fecha_auditoria_local);

CREATE TABLE IF NOT EXISTS auditoria_onus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auditoria_id INTEGER NOT NULL REFERENCES auditorias(id) ON DELETE CASCADE,
  carga_id INTEGER REFERENCES cargas_base(id),   -- base usada en el cruce
  base_desactualizada INTEGER NOT NULL DEFAULT 0,
  sn TEXT,
  sn_norm TEXT,
  olt_nombre TEXT NOT NULL,
  tarjeta INTEGER,
  puerto INTEGER,
  onu_num TEXT,
  name_smartolt TEXT,
  contact TEXT,
  status TEXT,                           -- Online | Offline | LOS | Power fail
  last_status_change TEXT,               -- normalizado "AAAA-MM-DDTHH:MM:SS"
  zona TEXT,
  direccion_smartolt TEXT,
  clasificacion TEXT,                    -- falla | powerfail | online | caida_previa
  cuenta TEXT,                           -- NULL = sin cruzar
  metodo_cruce TEXT,                     -- serial | contact | cuenta_en_name | cedula_en_name | nombre
  -- Copia de los datos del cliente al momento del cruce (el listado se reproduce aunque la base se reemplace)
  cli_nombre TEXT,
  cli_telefono TEXT,
  cli_cedula TEXT,
  cli_sector TEXT,
  cli_estado_contrato TEXT,
  cli_sucursal TEXT
);
CREATE INDEX IF NOT EXISTS idx_ao_aud    ON auditoria_onus(auditoria_id);
CREATE INDEX IF NOT EXISTS idx_ao_puerto ON auditoria_onus(olt_nombre, tarjeta, puerto);
CREATE INDEX IF NOT EXISTS idx_ao_cuenta ON auditoria_onus(cuenta);

-- ---------- Enlace ticket ↔ auditoría (no se copian datos del ticket) ----------
CREATE TABLE IF NOT EXISTS ticket_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  auditoria_id INTEGER NOT NULL REFERENCES auditorias(id) ON DELETE CASCADE,
  olt TEXT NOT NULL,
  tarjeta INTEGER,
  puerto INTEGER,
  vigente INTEGER NOT NULL DEFAULT 1,    -- 1 = la auditoría más reciente que cumple para ese puerto
  revisar_duplicado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ta_ticket ON ticket_auditoria(ticket_id, vigente);
CREATE INDEX IF NOT EXISTS idx_ta_aud    ON ticket_auditoria(auditoria_id);

-- ---------- Alertas de "Posible falla no reportada" ----------
CREATE TABLE IF NOT EXISTS alertas_no_reportadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auditoria_id INTEGER NOT NULL REFERENCES auditorias(id) ON DELETE CASCADE,
  olt TEXT NOT NULL,
  tarjeta INTEGER,
  puerto INTEGER,
  n_onus INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'abierta',   -- abierta | cubierta | descartada
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  comentario TEXT,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resuelto_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_alert_estado ON alertas_no_reportadas(estado, olt);
