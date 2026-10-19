-- ============================================================
-- Catálogos base (editables luego desde la tabla directamente,
-- o desde una futura pantalla de administración)
-- ============================================================

INSERT INTO catalogo_categorias (nombre, orden) VALUES
('SOPORTE TÉCNICO', 1),
('CENTRAL TELEFÓNICA', 2),
('HERRAMIENTAS VNET', 3),
('MERCADEO', 4),
('PAGOS', 5);

INSERT INTO catalogo_afectaciones (categoria_id, nombre, orden) VALUES
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'SIN CONEXIÓN', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'INTERMITENCIAS', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'DEGRADACIÓN', 3),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'SIN ACCESO A PÁGINAS', 4),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'FALLA DE NAVEGACIÓN', 5),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'CAPACIDAD', 6),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'PÉRDIDA DE GESTIÓN OLT', 7),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'PLEY', 8),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'VPN', 9),
((SELECT id FROM catalogo_categorias WHERE nombre = 'SOPORTE TÉCNICO'), 'VENTANA DE MANTENIMIENTO', 10),
((SELECT id FROM catalogo_categorias WHERE nombre = 'CENTRAL TELEFÓNICA'), 'FALLA EN LLAMADAS', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'CENTRAL TELEFÓNICA'), 'CENTRAL TELEFÓNICA', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'PAGOS'), 'PORTAL DE PAGOS', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'PAGOS'), 'CAJA POS', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'PAGOS'), 'FACTURACIÓN', 3),
((SELECT id FROM catalogo_categorias WHERE nombre = 'PAGOS'), 'MÉTODO DE PAGO NO DISPONIBLE', 4),
((SELECT id FROM catalogo_categorias WHERE nombre = 'HERRAMIENTAS VNET'), 'ARADIAL', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'HERRAMIENTAS VNET'), 'GLPI', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'HERRAMIENTAS VNET'), 'TOOLBOX', 3),
((SELECT id FROM catalogo_categorias WHERE nombre = 'HERRAMIENTAS VNET'), 'NICE', 4),
((SELECT id FROM catalogo_categorias WHERE nombre = 'HERRAMIENTAS VNET'), 'CXONE', 5),
((SELECT id FROM catalogo_categorias WHERE nombre = 'MERCADEO'), 'PORTAL WEB VNET', 1);

INSERT INTO catalogo_comentarios (nombre, orden) VALUES
('NINGUNO', 1),
('CLIENTES MIGRADOS', 2),
('FALLA DE MIGRACIÓN', 3),
('BAJA DISPONIBILIDAD', 4),
('REDUCCIÓN DE TRÁFICO', 5),
('LENTITUD', 6),
('PÉRDIDA DE CONEXIÓN CIRCUITOS', 7),
('INTERMITENCIAS', 8),
('ALTA LATENCIA', 9);

INSERT INTO catalogo_unidades_resolutorias (nombre, orden) VALUES
('REPARACIONES', 1),
('OBSERVACIÓN', 2),
('TECNOLOGÍA', 3),
('OLR', 4),
('CONTROL DE CAMBIOS', 5),
('MIGURA', 6),
('NETUNO', 7),
('HELPDESK', 8),
('SISTEMAS', 9),
('MERCADEO', 10);

INSERT INTO catalogo_estados_ticket (nombre, orden) VALUES
('EN CURSO (ASIGNADO)', 1),
('EN OBSERVACIÓN', 2),
('VENTANA DE MANTENIMIENTO', 3),
('RESUELTO', 4),
('CERRADO', 5);

INSERT INTO catalogo_estados_puerto (nombre, orden) VALUES
('EN CURSO (ASIGNADO)', 1),
('EN OBSERVACIÓN', 2),
('RESUELTO', 3),
('DESCARTADO', 4),
('CERRADO', 5);
