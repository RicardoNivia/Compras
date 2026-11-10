-- Migración de DATOS (no de esquema): asocia el maestro "Responsable" y los
-- registros históricos que hoy tienen texto libre "andrea"/"yuli" (y variantes
-- como "Andrea M"/"Yuli M") a los usuarios REALES que ya existen en este
-- entorno — no crea usuarios nuevos, solo los busca por correo.
--
-- Equivalente en desarrollo: backend/scripts/_migracion-responsables.cjs
-- (ese script sí creó los usuarios porque en dev no existían; aquí en
-- cambio los usuarios ya existen, por eso la única diferencia real).
--
-- Esta migración queda en el historial de Prisma y por lo tanto se aplicará
-- en CUALQUIER entorno (incluido un local/dev donde estos correos no
-- existan) la próxima vez que se corra `prisma migrate dev`/`deploy` ahí. Por
-- eso cada bloque se salta en silencio (RAISE NOTICE, no EXCEPTION) si no
-- encuentra el usuario — nunca bloquea el deploy ni rompe otros entornos.
DO $$
DECLARE
  v_katy_id      TEXT;
  v_katy_nombre  TEXT;
  v_yuli_id      TEXT;
  v_yuli_nombre  TEXT;
  v_count        INTEGER;
BEGIN
  SELECT id, nombre INTO v_katy_id, v_katy_nombre
  FROM "users" WHERE lower(email) = 'katy.ramirez@sinco.co';
  IF v_katy_id IS NULL THEN
    RAISE NOTICE 'Migración responsable: no existe katy.ramirez@sinco.co en este entorno, se omite.';
  ELSE
    INSERT INTO "maestros" (id, tipo, valor, "userId", activo, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'responsable', v_katy_nombre, v_katy_id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (tipo, valor) DO UPDATE SET "userId" = EXCLUDED."userId", activo = true, "updatedAt" = CURRENT_TIMESTAMP;

    UPDATE "records"
    SET responsable = v_katy_nombre, "responsableUserId" = v_katy_id
    WHERE responsable ILIKE 'andrea%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Migración responsable: % registro(s) migrados a % (%).', v_count, v_katy_nombre, v_katy_id;
  END IF;

  SELECT id, nombre INTO v_yuli_id, v_yuli_nombre
  FROM "users" WHERE lower(email) = 'yuli.moyano@sinco.co';
  IF v_yuli_id IS NULL THEN
    RAISE NOTICE 'Migración responsable: no existe yuli.moyano@sinco.co en este entorno, se omite.';
  ELSE
    INSERT INTO "maestros" (id, tipo, valor, "userId", activo, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, 'responsable', v_yuli_nombre, v_yuli_id, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (tipo, valor) DO UPDATE SET "userId" = EXCLUDED."userId", activo = true, "updatedAt" = CURRENT_TIMESTAMP;

    UPDATE "records"
    SET responsable = v_yuli_nombre, "responsableUserId" = v_yuli_id
    WHERE responsable ILIKE 'yuli%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Migración responsable: % registro(s) migrados a % (%).', v_count, v_yuli_nombre, v_yuli_id;
  END IF;

  -- Limpieza general (no solo andrea/yuli): borra cualquier valor de
  -- "responsable" que NO esté atado a un usuario ("userId" IS NULL) Y que ya
  -- no tenga ningún registro que lo referencie por texto — nunca borra uno
  -- que todavía esté en uso, sin importar si tiene userId o no. Corre siempre
  -- (no solo cuando se encuentra katy/yuli), así deja el maestro sin basura
  -- de texto libre en cualquier entorno donde se aplique.
  DELETE FROM "maestros" m
  WHERE m.tipo = 'responsable' AND m."userId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "records" r WHERE r.responsable = m.valor);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Migración responsable: % valor(es) de texto libre sin usuario y sin uso eliminados de maestros.', v_count;
END $$;
