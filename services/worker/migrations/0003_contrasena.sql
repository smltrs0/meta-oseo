-- Contraseña opcional por usuario (hash PBKDF2-SHA256, ver src/core/contrasena.ts). Si la fila la tiene,
-- `POST /api/auth/login` la exige; las cuentas sin ella siguen entrando solo con la identificación.
-- Se asigna a mano (cuenta del docente); no hay registro ni cambio de contraseña desde la interfaz.
ALTER TABLE users ADD COLUMN password_hash TEXT;
