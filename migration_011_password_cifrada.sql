-- Migración 011: cambia el almacenamiento de contraseñas de hash (PBKDF2,
-- irreversible) a cifrado reversible (AES-GCM), para que el administrador
-- pueda ver la contraseña actual de cada usuario desde el panel.
--
-- Renombra la columna password_hash -> password_cifrada. Los valores viejos
-- (hashes PBKDF2) NO son compatibles con el nuevo formato, así que quedan
-- vacíos: todos los usuarios necesitan que se les asigne contraseña de
-- nuevo (la migración 012 hace justamente eso, con las contraseñas
-- temporales por rol).
--
-- Cómo aplicarla (una sola vez):
--   npx wrangler d1 execute vnet_fallas_masivas --remote --file=./migration_011_password_cifrada.sql

ALTER TABLE usuarios RENAME COLUMN password_hash TO password_cifrada;
UPDATE usuarios SET password_cifrada = NULL;
