-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_nit_key" ON "proveedores"("nit");

-- Backfill: un proveedor por NIT distinto (solo dígitos) a partir de los
-- registros existentes que ya tienen NIT y nombre. Si un mismo NIT aparece con
-- nombres distintos se toma el primero alfabéticamente; se corrige luego desde Maestros.
INSERT INTO "proveedores" ("id", "nit", "nombre", "activo", "updatedAt")
SELECT gen_random_uuid()::text, t.nit, t.nombre, true, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (regexp_replace("nit", '[^0-9]', '', 'g'))
        regexp_replace("nit", '[^0-9]', '', 'g') AS nit,
        btrim("proveedor") AS nombre
    FROM "records"
    WHERE "nit" IS NOT NULL
      AND regexp_replace("nit", '[^0-9]', '', 'g') <> ''
      AND "proveedor" IS NOT NULL
      AND btrim("proveedor") <> ''
    ORDER BY regexp_replace("nit", '[^0-9]', '', 'g'), btrim("proveedor")
) t;
