-- Roles personalizados (Usuarios › Roles) y el rol Bienestar con sus funcionalidades.

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_clave_key" ON "roles"("clave");


-- Texto siempre UTF-8 sin caracteres dañados (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('roles');

-- Rol Bienestar: gestiona el módulo de Bienestar (actividades, cronograma y asociar sus compras), ve las compras en
-- Registros (sin editarlas), usa Nova y configura sus notificaciones. Lo demás se ajusta en la Matriz de permisos.
INSERT INTO "roles" ("clave", "nombre", "descripcion", "creadoPorNombre", "updatedAt")
VALUES ('bienestar', 'Bienestar', 'Equipo de Bienestar: actividades, cronograma, presupuesto por actividad y sus compras.', 'Migración histórica', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("id", "role", "feature", "allowed", "updatedAt")
SELECT 'rpb' || substr(md5('bienestar|' || f), 1, 22), 'bienestar', f, true, CURRENT_TIMESTAMP
FROM unnest(ARRAY['viewBienestar', 'editBienestar', 'viewRegistros', 'viewAgenteIA', 'viewNotificaciones']) AS f
ON CONFLICT ("role", "feature") DO NOTHING;
