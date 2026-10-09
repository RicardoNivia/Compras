-- AlterTable: Proveedor gana un código entero autoincremental (secuencia
-- propia) — es la referencia real y estable que usan los registros, en vez
-- del nit (que puede ser un placeholder "PENDIENTE-..." o cambiar con el
-- tiempo). Postgres rellena automáticamente el código de los proveedores que
-- ya existan con valores secuenciales al agregar la columna.
CREATE SEQUENCE IF NOT EXISTS "proveedores_codigo_seq";
ALTER TABLE "proveedores" ADD COLUMN "codigo" INTEGER NOT NULL DEFAULT nextval('proveedores_codigo_seq');
ALTER SEQUENCE "proveedores_codigo_seq" OWNED BY "proveedores"."codigo";
CREATE UNIQUE INDEX "proveedores_codigo_key" ON "proveedores"("codigo");

-- AlterTable: Record gana la referencia real al proveedor (por código, no
-- por nit/nombre). nit/proveedor (texto) se conservan como snapshot — ver
-- lib/records.js para cómo se reemplazan por el valor actual al listar.
ALTER TABLE "records" ADD COLUMN "proveedorId" INTEGER;

-- Backfill de datos: todo registro histórico cuyo "proveedor" (texto)
-- coincida EXACTO con el nombre de un proveedor del catálogo (ver migración
-- proveedores_backfill_desde_historico) queda atado a su código real. Los
-- 3 registros sin proveedor, o cuyo texto no matchee ningún nombre del
-- catálogo, quedan con proveedorId null (se corrigen a mano si hace falta).
UPDATE "records" r
SET "proveedorId" = p.codigo
FROM "proveedores" p
WHERE r.proveedor = p.nombre AND r."proveedorId" IS NULL;
