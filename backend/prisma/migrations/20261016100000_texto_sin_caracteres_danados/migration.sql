-- Ninguna tabla puede guardar texto con caracteres dañados.
--
-- Cuando un texto llega con una codificación equivocada (consola de Windows, CSV en Latin-1, un script sin UTF-8…)
-- los acentos y la ñ se convierten en U+FFFD ("U+FFFD", p. ej. "Andrea PU+FFFDrez") y el dato ya no se puede recuperar. Aquí se
-- rechaza en la base de datos, que es el último punto por el que pasa TODA escritura (app, scripts, importaciones).
--
-- Regla: una escritura no puede AÑADIR caracteres U+FFFD a la fila. Si una fila antigua ya los traía, se puede seguir
-- editando sin bloquearla, pero nunca se puede agregar uno nuevo.
--
-- Las tablas que se creen más adelante deben protegerse en su propia migración con:
--   SELECT proteger_texto_tabla('nombre_de_la_tabla');
-- (el script `npm run db:verificar-texto` avisa si alguna tabla quedó sin proteger).

CREATE OR REPLACE FUNCTION rechazar_texto_danado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  nuevo text := to_jsonb(NEW)::text;
  viejo text := '';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    viejo := to_jsonb(OLD)::text;
  END IF;
  IF (length(nuevo) - length(replace(nuevo, chr(65533), ''))) > (length(viejo) - length(replace(viejo, chr(65533), ''))) THEN
    RAISE EXCEPTION 'Texto con caracteres dañados (U+FFFD) en la tabla "%": la codificación debe ser UTF-8. Vuelve a escribir los acentos y la ñ.', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION proteger_texto_tabla(tabla text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_texto_sin_danos ON %I', tabla);
  EXECUTE format(
    'CREATE TRIGGER trg_texto_sin_danos BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION rechazar_texto_danado()',
    tabla
  );
END;
$$;

-- Protege todas las tablas que existen hoy (menos el historial de migraciones de Prisma).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
  LOOP
    PERFORM proteger_texto_tabla(t.table_name);
  END LOOP;
END;
$$;
