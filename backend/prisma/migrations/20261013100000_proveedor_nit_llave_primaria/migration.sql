-- Proveedor: el NIT pasa a ser la llave primaria y todas las relaciones apuntan
-- al NIT. Tipo (criticidad), clasificación por monto, tipo de servicio y área
-- de proveedor (maestro propio, distinto del área de Compras) pasan a ser
-- maestros referenciados por id. Conserva los datos existentes: primero se
-- copian las referencias (id → NIT), luego se cambia la llave.
--
-- Escrita a mano (no autogenerada) porque Prisma la resolvería con DROP COLUMN
-- y se perderían las referencias. El resultado final coincide con lo que
-- genera `prisma migrate diff` para schema.prisma (mismos nombres de
-- constraints e índices).

-- 1) NIT normalizado y sin duplicados antes de volverlo llave primaria.
--    Mayúsculas, solo letras y dígitos (NIT extranjeros alfanuméricos incluidos),
--    salvo los provisionales "PENDIENTE-…". Si la normalización produjera un
--    duplicado la migración se detiene (no se fusiona nada a ciegas).
UPDATE "proveedores" SET "nit" = regexp_replace(upper("nit"), '[^A-Z0-9]', '', 'g')
WHERE "nit" !~* '^PEND' AND "nit" ~ '[^A-Z0-9]';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "proveedores" WHERE "nit" IS NULL OR "nit" = '') THEN
    RAISE EXCEPTION 'Hay proveedores sin NIT: corrígelos antes de migrar.';
  END IF;
  IF EXISTS (SELECT "nit" FROM "proveedores" GROUP BY "nit" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Hay NIT duplicados en proveedores: unifícalos antes de migrar.';
  END IF;
  IF EXISTS (SELECT 1 FROM "records" r WHERE r."proveedorId" IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM "proveedores" p WHERE p."id" = r."proveedorId")) THEN
    RAISE EXCEPTION 'Hay registros que apuntan a un proveedor inexistente: corrígelos antes de migrar.';
  END IF;
END $$;

-- 2) Nuevas columnas de referencia por NIT, rellenas desde el id actual.
ALTER TABLE "records" ADD COLUMN "proveedorNit" TEXT;
UPDATE "records" r SET "proveedorNit" = p."nit", "nit" = p."nit"
FROM "proveedores" p WHERE p."id" = r."proveedorId";

ALTER TABLE "calificaciones_proveedor" ADD COLUMN "proveedorNit" TEXT;
UPDATE "calificaciones_proveedor" c SET "proveedorNit" = p."nit"
FROM "proveedores" p WHERE p."id" = c."proveedorId";

ALTER TABLE "proveedor_ciclos" ADD COLUMN "proveedorNit" TEXT;
UPDATE "proveedor_ciclos" c SET "proveedorNit" = p."nit"
FROM "proveedores" p WHERE p."id" = c."proveedorId";

ALTER TABLE "proveedor_procesos" ADD COLUMN "proveedorNit" TEXT;
UPDATE "proveedor_procesos" c SET "proveedorNit" = p."nit"
FROM "proveedores" p WHERE p."id" = c."proveedorId";

ALTER TABLE "proveedor_checklists" ADD COLUMN "proveedorNit" TEXT;
UPDATE "proveedor_checklists" c SET "proveedorNit" = p."nit"
FROM "proveedores" p WHERE p."id" = c."proveedorId";

-- La auditoría de proveedores pasa a identificarlos por NIT (mismo historial).
UPDATE "audit_logs" a SET "recordId" = p."nit"
FROM "proveedores" p
WHERE a."entityType" IN ('proveedor', 'cicloProveedor') AND a."recordId" = p."id";

-- 3) Quita FKs, índices y columnas que usaban el id viejo.
ALTER TABLE "proveedor_ciclos" DROP CONSTRAINT "proveedor_ciclos_proveedorId_fkey";
ALTER TABLE "proveedor_procesos" DROP CONSTRAINT "proveedor_procesos_proveedorId_fkey";
ALTER TABLE "proveedor_checklists" DROP CONSTRAINT "proveedor_checklists_proveedorId_fkey";
DROP INDEX "proveedor_ciclos_proveedorId_anio_key";
DROP INDEX "proveedor_procesos_proveedorId_idx";

ALTER TABLE "records" DROP COLUMN "proveedorId";
ALTER TABLE "calificaciones_proveedor" DROP COLUMN "proveedorId";
ALTER TABLE "proveedor_ciclos" DROP COLUMN "proveedorId";
ALTER TABLE "proveedor_ciclos" ALTER COLUMN "proveedorNit" SET NOT NULL;
ALTER TABLE "proveedor_procesos" DROP COLUMN "proveedorId";
ALTER TABLE "proveedor_procesos" ALTER COLUMN "proveedorNit" SET NOT NULL;
ALTER TABLE "proveedor_checklists" DROP CONSTRAINT "proveedor_checklists_pkey";
ALTER TABLE "proveedor_checklists" DROP COLUMN "proveedorId";
ALTER TABLE "proveedor_checklists" ALTER COLUMN "proveedorNit" SET NOT NULL;
ALTER TABLE "proveedor_checklists" ADD CONSTRAINT "proveedor_checklists_pkey" PRIMARY KEY ("proveedorNit");

-- 4) NIT como llave primaria de proveedores.
DROP INDEX "proveedores_nit_key";
ALTER TABLE "proveedores" DROP CONSTRAINT "proveedores_pkey";
ALTER TABLE "proveedores" DROP COLUMN "id";
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("nit");

-- 5) Maestros de proveedor: tipo, clasificación por monto, tipo de servicio
--    (y los motivos de excepción base). Idempotente por (tipo, valor).
ALTER TABLE "proveedores" ADD COLUMN "tipoProveedorId" TEXT,
ADD COLUMN "clasificacionMontoId" TEXT,
ADD COLUMN "tipoServicioId" TEXT;

INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT 'mig' || substr(md5(v.tipo || v.valor), 1, 22), v.tipo, v.valor, true, NOW(), NOW()
FROM (VALUES
  ('tipoProveedor', 'Crítico'),
  ('tipoProveedor', 'No crítico'),
  ('clasificacionMonto', 'Adquisición de Bajo Impacto'),
  ('clasificacionMonto', 'Operación de Alto Costo'),
  ('clasificacionMonto', 'Grandes Contribuyentes o excepciones'),
  ('clasificacionMonto', 'Proveedor Internacional'),
  ('motivoExcepcion', 'Gran contribuyente'),
  ('motivoExcepcion', 'Proveedor internacional'),
  ('motivoExcepcion', 'Compra ocasional'),
  ('motivoExcepcion', 'Actividad económica'),
  ('motivoExcepcion', 'Por clasificar')
) AS v(tipo, valor)
ON CONFLICT ("tipo", "valor") DO NOTHING;

-- Tipos de servicio que ya existen como texto libre (sin distinguir mayúsculas ni espacios).
INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT DISTINCT ON (lower(btrim(regexp_replace("servicio", '\s+', ' ', 'g'))))
  'mig' || substr(md5('tipoServicio' || lower(btrim(regexp_replace("servicio", '\s+', ' ', 'g')))), 1, 22),
  'tipoServicio', btrim(regexp_replace("servicio", '\s+', ' ', 'g')), true, NOW(), NOW()
FROM "proveedores"
WHERE btrim(coalesce("servicio", '')) NOT IN ('', '-')
  AND NOT EXISTS (SELECT 1 FROM "maestros" m WHERE m."tipo" = 'tipoServicio'
                  AND lower(m."valor") = lower(btrim(regexp_replace("servicio", '\s+', ' ', 'g'))))
ORDER BY lower(btrim(regexp_replace("servicio", '\s+', ' ', 'g'))), "servicio"
ON CONFLICT ("tipo", "valor") DO NOTHING;

-- Áreas de proveedor: maestro PROPIO ("areaProveedor"), distinto del área de
-- Compras ("area"). Las áreas que hoy usen proveedores/procesos se copian al
-- nuevo maestro y se re-apuntan; el maestro "area" de Compras no se toca.
INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT DISTINCT 'mig' || substr(md5('areaProveedor' || m."valor"), 1, 22), 'areaProveedor', m."valor", true, NOW(), NOW()
FROM "maestros" m
WHERE m."tipo" = 'area'
  AND (m."id" IN (SELECT "areaId" FROM "proveedores" WHERE "areaId" IS NOT NULL)
    OR m."id" IN (SELECT "areaId" FROM "proveedor_procesos" WHERE "areaId" IS NOT NULL))
ON CONFLICT ("tipo", "valor") DO NOTHING;

INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT DISTINCT 'mig' || substr(md5('areaProveedor' || btrim(p."area")), 1, 22), 'areaProveedor', btrim(p."area"), true, NOW(), NOW()
FROM "proveedores" p
WHERE p."areaId" IS NULL AND btrim(coalesce(p."area", '')) NOT IN ('', '-')
ON CONFLICT ("tipo", "valor") DO NOTHING;

UPDATE "proveedores" p SET "areaId" = ap."id", "area" = ap."valor"
FROM "maestros" ap
WHERE ap."tipo" = 'areaProveedor'
  AND ap."valor" = coalesce((SELECT a."valor" FROM "maestros" a WHERE a."id" = p."areaId" AND a."tipo" = 'area'), btrim(p."area"));
UPDATE "proveedores" SET "areaId" = NULL, "area" = NULL
WHERE "areaId" IS NOT NULL AND "areaId" NOT IN (SELECT "id" FROM "maestros" WHERE "tipo" = 'areaProveedor');

UPDATE "proveedor_procesos" pp SET "areaId" = ap."id", "area" = ap."valor"
FROM "maestros" a, "maestros" ap
WHERE a."id" = pp."areaId" AND a."tipo" = 'area' AND ap."tipo" = 'areaProveedor' AND ap."valor" = a."valor";

-- Asociación por id + snapshot igual al valor del maestro.
UPDATE "proveedores" p SET "tipoProveedorId" = m."id", "criticidad" = m."valor"
FROM "maestros" m
WHERE m."tipo" = 'tipoProveedor' AND p."criticidad" IS NOT NULL
  AND m."valor" = CASE
    WHEN translate(lower(p."criticidad"), 'áéíóú', 'aeiou') ~ 'no ?critic' THEN 'No crítico'
    WHEN translate(lower(p."criticidad"), 'áéíóú', 'aeiou') ~ 'critic' THEN 'Crítico'
  END;
UPDATE "proveedores" SET "criticidad" = NULL WHERE "tipoProveedorId" IS NULL;

UPDATE "proveedores" p SET "clasificacionMontoId" = m."id", "clasificacionMonto" = m."valor"
FROM "maestros" m
WHERE m."tipo" = 'clasificacionMonto' AND lower(m."valor") = lower(btrim(p."clasificacionMonto"));
UPDATE "proveedores" SET "clasificacionMonto" = NULL WHERE "clasificacionMontoId" IS NULL;

UPDATE "proveedores" p SET "tipoServicioId" = m."id", "servicio" = m."valor"
FROM "maestros" m
WHERE m."tipo" = 'tipoServicio' AND lower(m."valor") = lower(btrim(regexp_replace(p."servicio", '\s+', ' ', 'g')));
UPDATE "proveedores" SET "servicio" = NULL WHERE "tipoServicioId" IS NULL;

-- 6) El ciclo se calcula con la fecha de la última actualización: los que ya
--    quedaron Actualizados en un ciclo y no tienen fecha la toman de la aprobación.
UPDATE "proveedores" p SET "fechaActualizacion" = x."fecha"
FROM (
  SELECT "proveedorNit", MAX(coalesce("aprobadoAt", "updatedAt")) AS "fecha"
  FROM "proveedor_ciclos" WHERE "estado" = 'actualizado' GROUP BY "proveedorNit"
) x
WHERE x."proveedorNit" = p."nit" AND p."fechaActualizacion" IS NULL;

-- 7) Índices y llaves foráneas por NIT (ON UPDATE CASCADE: corregir un NIT se propaga solo).
CREATE INDEX "records_proveedorNit_idx" ON "records"("proveedorNit");
CREATE INDEX "proveedores_tipoProveedorId_idx" ON "proveedores"("tipoProveedorId");
CREATE INDEX "proveedores_clasificacionMontoId_idx" ON "proveedores"("clasificacionMontoId");
CREATE INDEX "proveedores_tipoServicioId_idx" ON "proveedores"("tipoServicioId");
CREATE INDEX "proveedores_areaId_idx" ON "proveedores"("areaId");
CREATE UNIQUE INDEX "proveedor_ciclos_proveedorNit_anio_key" ON "proveedor_ciclos"("proveedorNit", "anio");
CREATE INDEX "proveedor_procesos_proveedorNit_idx" ON "proveedor_procesos"("proveedorNit");

ALTER TABLE "records" ADD CONSTRAINT "records_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proveedor_ciclos" ADD CONSTRAINT "proveedor_ciclos_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proveedor_procesos" ADD CONSTRAINT "proveedor_procesos_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proveedor_checklists" ADD CONSTRAINT "proveedor_checklists_proveedorNit_fkey" FOREIGN KEY ("proveedorNit") REFERENCES "proveedores"("nit") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8) Permisos: el rol Proveedores accede a Maestros (donde ahora vive el ciclo
--    de proveedores) y a Nova (IA). Se guarda explícito en la Matriz de permisos
--    para que una excepción anterior no lo deje sin acceso.
INSERT INTO "role_permissions" ("id", "role", "feature", "allowed", "updatedAt")
VALUES ('migperm' || substr(md5('proveedores-viewMaestros'), 1, 18), 'proveedores', 'viewMaestros', true, NOW()),
       ('migperm' || substr(md5('proveedores-viewAgenteIA'), 1, 18), 'proveedores', 'viewAgenteIA', true, NOW())
ON CONFLICT ("role", "feature") DO UPDATE SET "allowed" = true, "updatedAt" = NOW();
