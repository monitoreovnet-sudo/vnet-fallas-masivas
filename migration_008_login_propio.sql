-- Migración 008: soporte para login propio.
--  - Agrega password_hash a usuarios (vacío hasta que el admin asigne una
--    contraseña a cada correo desde el módulo de Administración).
--  - Renombra el rol 'consultor' a 'observador' (mismo permiso, nuevo nombre).
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_008_login_propio.sql

ALTER TABLE usuarios ADD COLUMN password_hash TEXT;

UPDATE usuarios SET rol = 'observador' WHERE rol = 'consultor';
