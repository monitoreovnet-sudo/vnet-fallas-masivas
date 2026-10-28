-- Migración 033: contraseña obligatoria en el primer inicio de sesión.
-- Todos los usuarios actuales quedan marcados (1): en su próximo ingreso deberán crear y confirmar su propia contraseña.
ALTER TABLE usuarios ADD COLUMN debe_cambiar_password INTEGER NOT NULL DEFAULT 1;
