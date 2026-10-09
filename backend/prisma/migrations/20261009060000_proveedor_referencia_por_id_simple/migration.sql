-- Simplificación: Proveedor ya tiene un id único y estable (cuid) — no hacía
-- falta un "codigo" aparte para referenciarlo desde Record. Se elimina
-- "codigo" y Record.proveedorId pasa a guardar directo el id del Proveedor,
-- igual que ya funciona para los demás maestros (Record.areaId -> Maestro.id,
-- etc.) y para responsable (Record.responsableUserId -> User.id).

-- 1. Columna temporal de texto para el nuevo valor (id de Proveedor).
ALTER TABLE "records" ADD COLUMN "proveedorId_new" TEXT;

-- 2. Backfill: mapea el código entero anterior al id real del proveedor.
UPDATE "records" r
SET "proveedorId_new" = p.id
FROM "proveedores" p
WHERE p.codigo = r."proveedorId";

-- 3. Reemplaza la columna vieja (entera) por la nueva (texto).
ALTER TABLE "records" DROP COLUMN "proveedorId";
ALTER TABLE "records" RENAME COLUMN "proveedorId_new" TO "proveedorId";

-- 4. Elimina "codigo" de Proveedor (y su secuencia) — ya no se usa para nada.
DROP INDEX IF EXISTS "proveedores_codigo_key";
ALTER TABLE "proveedores" DROP COLUMN IF EXISTS "codigo";
DROP SEQUENCE IF EXISTS "proveedores_codigo_seq";
