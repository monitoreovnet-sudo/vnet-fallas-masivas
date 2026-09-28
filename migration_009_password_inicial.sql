-- Migración 009: asigna una contraseña TEMPORAL a los 4 administradores,
-- para poder iniciar sesión por primera vez (antes de esto, nadie tiene
-- password_hash y el login es imposible -- es el huevo y la gallina del
-- primer arranque).
--
-- Contraseña temporal para los 4: CambiaEsto2026!
-- ¡Cámbiala de inmediato desde Administración → Usuarios → columna
-- "Nueva contraseña" apenas entres!
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_009_password_inicial.sql

UPDATE usuarios
SET password_hash = '4f6dd1bc12dff386f55303cc0b92299c:f62eb7b2d39f6ed6a7b15ac50dcc0f895d6fd86bd9f9dedf9a0f9cf7abf97352'
WHERE rol = 'administrador';
