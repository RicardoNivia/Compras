-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "creadoPorNombre" TEXT,
ADD COLUMN     "creadoPorUserId" TEXT;


-- Relleno de los proveedores que ya existían: no los creó una persona desde la app.
UPDATE "proveedores" SET "creadoPorNombre" = 'Migración histórica' WHERE "nit" LIKE 'PEND%' AND "creadoPorNombre" IS NULL;
UPDATE "proveedores" SET "creadoPorNombre" = 'Importación Excel' WHERE "creadoPorNombre" IS NULL;
