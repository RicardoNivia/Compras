-- Ajustes de Bienestar tras la simulación: puntaje de Nova vacío cuando no hay datos, Mi día para el rol Bienestar y áreas unificadas.
-- AlterTable
ALTER TABLE "analisis_actividad" ALTER COLUMN "puntaje" DROP NOT NULL;


-- El rol Bienestar ve Mi día y alertas (sus secciones: actividades que ya pasaron y siguen programadas, y ejecutadas sin
-- cerrar). Si el rol no existe en esta base, la fila no hace nada.
INSERT INTO "role_permissions" ("id", "role", "feature", "allowed", "updatedAt")
VALUES ('rpa' || substr(md5('bienestar|viewAlertas'), 1, 22), 'bienestar', 'viewAlertas', true, CURRENT_TIMESTAMP)
ON CONFLICT ("role", "feature") DO NOTHING;

-- Unifica el maestro de áreas: valores que son la misma área escrita de otra forma ("GenteSoft" / "Gentesoft",
-- "Sistemas de Gestión" / "Sistema de Gestion") partían el presupuesto en dos filas y las compras no cuadraban. Se
-- comparan sin tildes, mayúsculas, signos ni la s final de cada palabra (la misma regla de lib/maestros.js, que desde
-- ahora rechaza crear o renombrar a un valor así). Se queda el valor que más compras usa; sus compras y presupuestos
-- pasan a ese valor y, si el mismo año tenía presupuesto con los dos nombres, se suman en una sola fila.
DO $unificar$
DECLARE
  g RECORD;
  canon RECORD;
  dup RECORD;
  p RECORD;
  q RECORD;
BEGIN
  CREATE TEMP TABLE _areas ON COMMIT DROP AS
  SELECT m.id, m.valor, m."createdAt",
    regexp_replace(regexp_replace(regexp_replace(lower(translate(m.valor, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', ' ', 'g'), 's\y', '', 'g'), '\s+', '', 'g') AS clave,
    (SELECT count(*) FROM "records" r WHERE r."areaId" = m.id) AS usos
  FROM "maestros" m
  WHERE m.tipo = 'area';

  FOR g IN SELECT clave FROM _areas GROUP BY clave HAVING count(*) > 1 LOOP
    SELECT * INTO canon FROM _areas WHERE clave = g.clave ORDER BY usos DESC, "createdAt" ASC LIMIT 1;
    FOR dup IN SELECT * FROM _areas WHERE clave = g.clave AND id <> canon.id LOOP
      UPDATE "records" SET "areaId" = canon.id, "area" = canon.valor WHERE "areaId" = dup.id;
      UPDATE "records" SET "area" = canon.valor WHERE "areaId" IS NULL AND "area" = dup.valor;

      FOR p IN SELECT * FROM "presupuestos" WHERE "area" = dup.valor LOOP
        SELECT * INTO q FROM "presupuestos" WHERE "area" = canon.valor AND "anio" = p."anio";
        IF NOT FOUND THEN
          UPDATE "presupuestos" SET "area" = canon.valor, "updatedAt" = CURRENT_TIMESTAMP WHERE id = p.id;
        ELSE
          UPDATE "presupuestos"
          SET "valorArea" = CASE WHEN q."valorArea" IS NULL AND p."valorArea" IS NULL THEN NULL ELSE COALESCE(q."valorArea", 0) + COALESCE(p."valorArea", 0) END,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = q.id;
          INSERT INTO "presupuesto_categorias" ("id", "presupuestoId", "categoria", "valor")
          SELECT 'pcu' || substr(md5(c.id || q.id), 1, 22), q.id, c."categoria", c."valor"
          FROM "presupuesto_categorias" c WHERE c."presupuestoId" = p.id
          ON CONFLICT ("presupuestoId", "categoria") DO UPDATE SET "valor" = "presupuesto_categorias"."valor" + EXCLUDED."valor";
          DELETE FROM "presupuestos" WHERE id = p.id;
        END IF;
      END LOOP;

      DELETE FROM "maestros" WHERE id = dup.id;
      INSERT INTO "audit_logs" ("id", "action", "entityType", "recordId", "recordInfo", "userNombre", "changes")
      VALUES ('una' || substr(md5(dup.id || canon.id), 1, 22), 'editar', 'maestro', canon.id,
        'Área: unificó «' || dup.valor || '» en «' || canon.valor || '» (compras y presupuestos)', 'Migración histórica',
        json_build_array(json_build_object('field', 'valor', 'label', 'Valor', 'before', dup.valor, 'after', canon.valor))::text);
      RAISE NOTICE 'Área «%» unificada en «%»', dup.valor, canon.valor;
    END LOOP;
  END LOOP;
END
$unificar$;
