-- AlterTable: Record gana la referencia real (por id de Maestro) para cada
-- campo que tiene catálogo — área, estado, categoría, medio de pago y
-- estado de legalización — igual que ya se hizo para responsable
-- (responsableUserId) y proveedor (proveedorId). Las columnas de texto
-- (area, estado, categoria, medioPago, estadoLegalizacion) se conservan como
-- snapshot; al listar se reemplazan por el valor ACTUAL del maestro si la
-- referencia resuelve (ver hydrateConDatosActuales en lib/records.js).
ALTER TABLE "records" ADD COLUMN "areaId" TEXT;
ALTER TABLE "records" ADD COLUMN "estadoId" TEXT;
ALTER TABLE "records" ADD COLUMN "categoriaId" TEXT;
ALTER TABLE "records" ADD COLUMN "medioPagoId" TEXT;
ALTER TABLE "records" ADD COLUMN "estadoLegalizacionId" TEXT;

-- Backfill: para cada campo, todo registro cuyo texto coincida EXACTO con un
-- valor del maestro correspondiente queda atado a su id real. Lo que no
-- matchee (texto libre histórico que nunca estuvo en el maestro, o vacío)
-- queda con la columna *Id en null — se corrige a mano si hace falta, sin
-- perder el texto original.
UPDATE "records" r
SET "areaId" = m.id
FROM "maestros" m
WHERE m.tipo = 'area' AND m.valor = r.area AND r."areaId" IS NULL;

UPDATE "records" r
SET "estadoId" = m.id
FROM "maestros" m
WHERE m.tipo = 'estado' AND m.valor = r.estado AND r."estadoId" IS NULL;

UPDATE "records" r
SET "categoriaId" = m.id
FROM "maestros" m
WHERE m.tipo = 'categoria' AND m.valor = r.categoria AND r."categoriaId" IS NULL;

UPDATE "records" r
SET "medioPagoId" = m.id
FROM "maestros" m
WHERE m.tipo = 'medioPago' AND m.valor = r."medioPago" AND r."medioPagoId" IS NULL;

UPDATE "records" r
SET "estadoLegalizacionId" = m.id
FROM "maestros" m
WHERE m.tipo = 'estadoLegalizacion' AND m.valor = r."estadoLegalizacion" AND r."estadoLegalizacionId" IS NULL;
