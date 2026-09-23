-- Usuarios administradores por defecto. INSERT OR IGNORE los hace idempotentes
-- (si el email ya existe -por ejemplo por un `db:seed` previo- no falla ni
-- sobrescribe la contraseña actual). Contraseña por defecto: "12345678"
-- (bcrypt, 10 rounds) — debe rotarse en un despliegue real.
INSERT OR IGNORE INTO "users" ("id", "nombre", "email", "password", "role", "activo", "createdAt", "updatedAt")
VALUES
  ('658e6f43f9394fc799a421bba963fb58', 'Ricardo Nivia', 'ricardo.nivia@sinco.com.co', '$2a$10$1OlWtuHtYrLZ6CDr0p9veulcSij8aN61q/TMezjBQcd.9pQ9wg.Ba', 'admin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d802c1a3cf984532aff9425608a535fa', 'Carolina Daza', 'carolina.daza@sinco.com.co', '$2a$10$1OlWtuHtYrLZ6CDr0p9veulcSij8aN61q/TMezjBQcd.9pQ9wg.Ba', 'admin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
