-- ============================================================
-- Catálogos base (editables luego desde la tabla directamente,
-- o desde una futura pantalla de administración)
-- ============================================================

INSERT INTO catalogo_categorias (nombre, orden) VALUES
('Soporte Técnico (Internet / Pley)', 1),
('Central Telefónica', 2),
('Pagos', 3),
('Herramientas VNET', 4),
('Control de Cambios', 5);

INSERT INTO catalogo_afectaciones (categoria_id, nombre, orden) VALUES
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'SIN CONEXIÓN', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'INTERMITENCIAS', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'DEGRADACIÓN', 3),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'SIN ACCESO A PÁGINAS', 4),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'FALLA DE NAVEGACIÓN', 5),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'CAPACIDAD', 6),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'PÉRDIDA DE GESTIÓN OLT', 7),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'PLEY', 8),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'VPN', 9),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Soporte Técnico (Internet / Pley)'), 'VENTANA DE MANTENIMIENTO', 10),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Central Telefónica'), 'FALLA EN LLAMADAS', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Central Telefónica'), 'CENTRAL TELEFÓNICA', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Pagos'), 'PORTAL DE PAGOS', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Pagos'), 'CAJA POS', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Pagos'), 'FACTURACIÓN', 3),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Pagos'), 'MÉTODO DE PAGO NO DISPONIBLE', 4),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Herramientas VNET'), 'ARADIAL', 1),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Herramientas VNET'), 'GLPI', 2),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Herramientas VNET'), 'TOOLBOX', 3),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Herramientas VNET'), 'NICE', 4),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Herramientas VNET'), 'CXONE', 5),
((SELECT id FROM catalogo_categorias WHERE nombre = 'Control de Cambios'), 'VENTANA DE MANTENIMIENTO', 1);

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
('HELPDESK', 8);

INSERT INTO catalogo_estados_ticket (nombre, orden) VALUES
('EN CURSO (ASIGNADO)', 1),
('EN OBSERVACIÓN', 2),
('CIERRE DEL TICKET', 3),
('CERRADO', 4);

INSERT INTO catalogo_estados_puerto (nombre, orden) VALUES
('EN CURSO (ASIGNADO)', 1),
('EN OBSERVACIÓN', 2),
('RESUELTO', 3),
('DESCARTADO', 4);
