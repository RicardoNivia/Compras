-- Maestros de Bienestar y Matriz de permisos por módulo.
-- AlterTable
ALTER TABLE "inventario_actividad" ADD COLUMN     "unidadId" TEXT;

-- AlterTable
ALTER TABLE "maestros" ADD COLUMN     "creadoPorNombre" TEXT,
ADD COLUMN     "creadoPorUserId" TEXT;

-- AlterTable
ALTER TABLE "participantes_actividad" ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "motivoInasistenciaId" TEXT;


-- Lo que ya existía en maestros no tiene creador conocido.
UPDATE "maestros" SET "creadoPorNombre" = 'Migración histórica' WHERE "creadoPorNombre" IS NULL;

-- Catálogos iniciales. Las áreas y los ids de cada fila los deja scripts/bienestar/sincronizarCatalogos.mjs.
INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "aplicaEstrellas", "updatedAt", "creadoPorNombre")
SELECT 'mbi' || substr(md5(t.tipo || '|' || t.valor), 1, 22), t.tipo, t.valor, true, t.estrellas, CURRENT_TIMESTAMP, 'Migración histórica'
FROM (VALUES
  ('motivoInasistencia', 'Incapacidad médica', NULL::int), ('motivoInasistencia', 'Compromisos laborales', NULL), ('motivoInasistencia', 'Motivos personales', NULL),
  ('motivoInasistencia', 'Calamidad familiar', NULL), ('motivoInasistencia', 'Vacaciones', NULL), ('motivoInasistencia', 'Viaje', NULL),
  ('motivoInasistencia', 'Sin justificación', NULL), ('motivoInasistencia', 'Otro', NULL),
  ('unidadInventario', 'Unidades', NULL), ('unidadInventario', 'Cajas', NULL), ('unidadInventario', 'Paquetes', NULL),
  ('unidadInventario', 'Bolsas', NULL), ('unidadInventario', 'Kilogramos', NULL), ('unidadInventario', 'Litros', NULL),
  ('escalaCalificacion', 'Muy mala', 1), ('escalaCalificacion', 'Mala', 2), ('escalaCalificacion', 'Regular', 3),
  ('escalaCalificacion', 'Buena', 4), ('escalaCalificacion', 'Excelente', 5)
) AS t(tipo, valor, estrellas)
ON CONFLICT ("tipo", "valor") DO NOTHING;

-- Dashboard y Maestros de Bienestar son permisos nuevos: quien hoy ve Bienestar conserva el dashboard,
-- y el rol Bienestar además administra sus maestros.
INSERT INTO "role_permissions" ("id", "role", "feature", "allowed", "updatedAt")
SELECT 'rpd' || substr(md5("role" || '|viewDashboardBienestar'), 1, 22), "role", 'viewDashboardBienestar', "allowed", CURRENT_TIMESTAMP
FROM "role_permissions" WHERE "feature" = 'viewBienestar'
ON CONFLICT ("role", "feature") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role", "feature", "allowed", "updatedAt")
VALUES ('rpm' || substr(md5('bienestar|viewMaestrosBienestar'), 1, 22), 'bienestar', 'viewMaestrosBienestar', true, CURRENT_TIMESTAMP)
ON CONFLICT ("role", "feature") DO NOTHING;