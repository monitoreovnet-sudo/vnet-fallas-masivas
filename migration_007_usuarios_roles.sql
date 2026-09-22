-- Migración 007: carga usuarios con sus roles (administrador | supervisor | consultor)
-- npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_007_usuarios_roles.sql

UPDATE usuarios SET nombre = 'Humberto Suárez', rol = 'supervisor', activo = 1 WHERE email = 'humberto.suarez@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('humberto.suarez@vnet.com.ve', 'Humberto Suárez', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Jonathan Díaz', rol = 'supervisor', activo = 1 WHERE email = 'jonathan.diaz@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('jonathan.diaz@vnet.com.ve', 'Jonathan Díaz', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Aileen Bracho', rol = 'supervisor', activo = 1 WHERE email = 'aileen.bracho@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('aileen.bracho@vnet.com.ve', 'Aileen Bracho', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Dennis Zambrano', rol = 'supervisor', activo = 1 WHERE email = 'dennis.zambrano@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('dennis.zambrano@vnet.com.ve', 'Dennis Zambrano', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Erick Aldana', rol = 'supervisor', activo = 1 WHERE email = 'erick.aldana@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('erick.aldana@vnet.com.ve', 'Erick Aldana', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Rafael Dugarte', rol = 'supervisor', activo = 1 WHERE email = 'rafael.dugarte@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('rafael.dugarte@vnet.com.ve', 'Rafael Dugarte', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Lisbeth Rondón', rol = 'supervisor', activo = 1 WHERE email = 'lisbeth.rondon@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('lisbeth.rondon@vnet.com.ve', 'Lisbeth Rondón', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Luz Marina Hernández', rol = 'supervisor', activo = 1 WHERE email = 'luz.hernandezruiz@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('luz.hernandezruiz@vnet.com.ve', 'Luz Marina Hernández', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Iván Albornoz', rol = 'supervisor', activo = 1 WHERE email = 'ivan.albornoz@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('ivan.albornoz@vnet.com.ve', 'Iván Albornoz', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Alex Mendoza', rol = 'supervisor', activo = 1 WHERE email = 'alex.mendoza@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('alex.mendoza@vnet.com.ve', 'Alex Mendoza', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Sebastián Díaz', rol = 'supervisor', activo = 1 WHERE email = 'sebastian.diaz@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('sebastian.diaz@vnet.com.ve', 'Sebastián Díaz', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Dubberth Arias', rol = 'supervisor', activo = 1 WHERE email = 'dubberth.arias@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('dubberth.arias@vnet.com.ve', 'Dubberth Arias', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Ezio Sosa', rol = 'supervisor', activo = 1 WHERE email = 'ezio.sosa@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('ezio.sosa@vnet.com.ve', 'Ezio Sosa', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Lisbel Cáseres', rol = 'supervisor', activo = 1 WHERE email = 'lisbel.caseres@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('lisbel.caseres@vnet.com.ve', 'Lisbel Cáseres', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Judith Cruz', rol = 'supervisor', activo = 1 WHERE email = 'judith.cruz@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('judith.cruz@vnet.com.ve', 'Judith Cruz', 'supervisor', 1);

UPDATE usuarios SET nombre = 'Haycar Rivera', rol = 'consultor', activo = 1 WHERE email = 'haycar.rivera@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('haycar.rivera@vnet.com.ve', 'Haycar Rivera', 'consultor', 1);

UPDATE usuarios SET nombre = 'Marina Calderón', rol = 'consultor', activo = 1 WHERE email = 'marina.calderon@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('marina.calderon@vnet.com.ve', 'Marina Calderón', 'consultor', 1);

UPDATE usuarios SET nombre = 'Eduardo Montilla', rol = 'consultor', activo = 1 WHERE email = 'eduardo.montilla@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('eduardo.montilla@vnet.com.ve', 'Eduardo Montilla', 'consultor', 1);

UPDATE usuarios SET nombre = 'Johan Marrero', rol = 'administrador', activo = 1 WHERE email = 'johan.marrero@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('johan.marrero@vnet.com.ve', 'Johan Marrero', 'administrador', 1);

UPDATE usuarios SET nombre = 'Martin Piñango', rol = 'administrador', activo = 1 WHERE email = 'martin.pinango@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('martin.pinango@vnet.com.ve', 'Martin Piñango', 'administrador', 1);

UPDATE usuarios SET nombre = 'Gabriela Silva', rol = 'administrador', activo = 1 WHERE email = 'gabriela.silva@vnet.com.ve';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('gabriela.silva@vnet.com.ve', 'Gabriela Silva', 'administrador', 1);

UPDATE usuarios SET nombre = 'Monitoreo Vnet', rol = 'administrador', activo = 1 WHERE email = 'monitoreovnet@gmail.com';
INSERT OR IGNORE INTO usuarios (email, nombre, rol, activo) VALUES ('monitoreovnet@gmail.com', 'Monitoreo Vnet', 'administrador', 1);
