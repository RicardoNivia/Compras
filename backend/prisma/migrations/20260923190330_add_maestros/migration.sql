-- CreateTable
CREATE TABLE "maestros" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "maestros_tipo_valor_key" ON "maestros"("tipo", "valor");

-- Lista fija confirmada por el negocio para cada desplegable. INSERT OR IGNORE
-- los hace idempotentes ante el índice único (tipo, valor).
INSERT OR IGNORE INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), t.tipo, t.valor, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT 'area' AS tipo, 'Administrativo' AS valor
  UNION ALL SELECT 'area', 'Bienestar'
  UNION ALL SELECT 'area', 'CEO'
  UNION ALL SELECT 'area', 'Infraestructura'
  UNION ALL SELECT 'area', 'SST'
  UNION ALL SELECT 'area', 'Gentesoft'
  UNION ALL SELECT 'area', 'Bitakora'
  UNION ALL SELECT 'area', 'Cosmos'
  UNION ALL SELECT 'area', 'Desarrollo'
  UNION ALL SELECT 'area', 'Internacionalización'
  UNION ALL SELECT 'area', 'Jurídico'
  UNION ALL SELECT 'area', 'Sistema de Gestion'
  UNION ALL SELECT 'area', 'Proyectos y servicios'
  UNION ALL SELECT 'responsable', 'Andrea M'
  UNION ALL SELECT 'responsable', 'Yuli M'
  UNION ALL SELECT 'estado', 'Pendiente'
  UNION ALL SELECT 'estado', 'Proceso'
  UNION ALL SELECT 'estado', 'Ejecutado'
  UNION ALL SELECT 'estado', 'Anulado'
  UNION ALL SELECT 'medioPago', 'Transferencia'
  UNION ALL SELECT 'medioPago', 'T. Crédito'
  UNION ALL SELECT 'medioPago', 'C. Menor'
  UNION ALL SELECT 'medioPago', 'Anticipo'
  UNION ALL SELECT 'estadoLegalizacion', 'Acta'
  UNION ALL SELECT 'estadoLegalizacion', 'OC'
  UNION ALL SELECT 'estadoLegalizacion', 'N/A'
) t;

-- Rescate dinámico: cualquier valor que YA esté en uso en registros reales y
-- no esté en la lista fija de arriba también se siembra (activo), para no
-- romper el filtro/edición de registros existentes. En una BD nueva/demo con
-- "records" vacía esto no agrega nada (no hardcodea datos de producción).
INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'area', r.area, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT area FROM "records" WHERE area IS NOT NULL AND area <> '') r
WHERE NOT EXISTS (SELECT 1 FROM "maestros" m WHERE m.tipo = 'area' AND m.valor = r.area);

INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'responsable', r.responsable, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT responsable FROM "records" WHERE responsable IS NOT NULL AND responsable <> '') r
WHERE NOT EXISTS (SELECT 1 FROM "maestros" m WHERE m.tipo = 'responsable' AND m.valor = r.responsable);

INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'estado', r.estado, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT estado FROM "records" WHERE estado IS NOT NULL AND estado <> '') r
WHERE NOT EXISTS (SELECT 1 FROM "maestros" m WHERE m.tipo = 'estado' AND m.valor = r.estado);

INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'medioPago', r.medioPago, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT medioPago FROM "records" WHERE medioPago IS NOT NULL AND medioPago <> '') r
WHERE NOT EXISTS (SELECT 1 FROM "maestros" m WHERE m.tipo = 'medioPago' AND m.valor = r.medioPago);

INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'estadoLegalizacion', r.estadoLegalizacion, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT estadoLegalizacion FROM "records" WHERE estadoLegalizacion IS NOT NULL AND estadoLegalizacion <> '') r
WHERE NOT EXISTS (SELECT 1 FROM "maestros" m WHERE m.tipo = 'estadoLegalizacion' AND m.valor = r.estadoLegalizacion);
