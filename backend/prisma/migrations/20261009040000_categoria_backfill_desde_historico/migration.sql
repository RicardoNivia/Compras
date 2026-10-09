-- Migración de DATOS (no de esquema): prellena el maestro "categoria" con
-- los valores distintos ya usados en el histórico de compras. El formulario
-- de Registros acaba de pasar de texto libre (datalist, que el navegador
-- nunca obliga a respetar) a un <select> estricto sobre este maestro — sin
-- este backfill, cualquier entorno donde el maestro esté vacío (como
-- producción) se quedaría sin ninguna categoría seleccionable hasta
-- cargarlas a mano.
--
-- Idempotente: no duplica valores que ya existan (p.ej. en desarrollo, donde
-- el maestro ya estaba cargado manualmente).
INSERT INTO "maestros" (id, tipo, valor, activo, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'categoria',
  t.categoria,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT btrim(r.categoria) AS categoria
  FROM "records" r
  WHERE r.categoria IS NOT NULL AND btrim(r.categoria) <> ''
) t
WHERE NOT EXISTS (
  SELECT 1 FROM "maestros" m WHERE m.tipo = 'categoria' AND m.valor = t.categoria
);
