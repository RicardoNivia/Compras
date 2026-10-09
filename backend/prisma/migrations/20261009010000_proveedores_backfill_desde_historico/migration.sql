-- Migración de DATOS (no de esquema): prellena el catálogo de Proveedores
-- (Maestros → Proveedores) a partir de los nombres de proveedor ya usados en
-- el histórico de compras, que nunca tuvieron NIT (el campo se agregó
-- después). Como "nit" es obligatorio y único en el catálogo, no se puede
-- dejar vacío: se asigna un NIT placeholder único con prefijo "PENDIENTE-"
-- (fácil de ubicar con `WHERE nit LIKE 'PENDIENTE-%'`) para completar el NIT
-- real más adelante directamente en la base de datos. No modifica "records":
-- el nit real de cada compra histórica se queda vacío hasta que se complete
-- a mano — esta migración solo puebla el catálogo para que haya algo de
-- dónde elegir en registros NUEVOS.
--
-- Nota: si el mismo proveedor aparece escrito con variaciones (mayúsculas,
-- espacios, abreviaturas distintas) en el histórico, cada variación distinta
-- genera una fila propia con su propio NIT placeholder — esta migración NO
-- intenta fusionar nombres parecidos, eso se revisa a mano después.
--
-- Corre en cualquier entorno (incluido dev) donde haya registros con
-- proveedor de texto y el catálogo todavía no tenga ese nombre cargado.
INSERT INTO "proveedores" (id, nit, nombre, descripcion, activo, "documentacionAlDia", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'PENDIENTE-' || lpad(row_number() OVER (ORDER BY t.nombre)::text, 6, '0'),
  t.nombre,
  'Importado automáticamente desde el histórico de compras — falta completar el NIT real.',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT btrim(r.proveedor) AS nombre
  FROM "records" r
  WHERE r.proveedor IS NOT NULL AND btrim(r.proveedor) <> ''
) t
WHERE NOT EXISTS (
  SELECT 1 FROM "proveedores" p WHERE p.nombre = t.nombre
);
