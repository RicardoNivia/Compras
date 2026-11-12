-- Regla de Bienestar (2026-11-11): no debe quedar gente sin asistencia registrada. Toda persona de una actividad con
-- asistencia en NULL ("sin registrar") pasa a "asistió". Se recalculan los conteos de cada actividad tocada (como
-- lib/participantesBienestar.js#sincronizarConteos) y queda una entrada de Auditoría por actividad.
-- Solo actividades que YA pasaron (fecha de hoy o anterior, hora de Colombia): en las futuras o sin fecha, no tener
-- asistencia es lo normal (aún no se hacen) y no se tocan.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p."actividadId" AS id, COUNT(*) AS n
    FROM participantes_actividad p
    JOIN actividades_bienestar a ON a.id = p."actividadId"
    WHERE p.asistio IS NULL
      AND a.fecha IS NOT NULL
      AND a.fecha <= to_char(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')
    GROUP BY p."actividadId"
  LOOP
    UPDATE participantes_actividad
       SET asistio = TRUE, "motivoInasistencia" = NULL, "motivoInasistenciaId" = NULL
     WHERE "actividadId" = r.id AND asistio IS NULL;

    UPDATE actividades_bienestar a
       SET inscritos = (SELECT COUNT(*) FROM participantes_actividad p WHERE p."actividadId" = r.id AND p.inscrito),
           asistentes = (SELECT COUNT(*) FROM participantes_actividad p WHERE p."actividadId" = r.id AND p.asistio)
     WHERE a.id = r.id;

    INSERT INTO audit_logs (id, action, "entityType", "recordId", "recordInfo", "userNombre", changes, "createdAt")
    SELECT 'mig-asist-' || r.id || '-' || md5(random()::text), 'editar', 'participante', r.id::text,
           COALESCE(a.fecha || ' · ', '') || a.nombre, 'Migración histórica',
           json_build_array(json_build_object('field', 'detalle', 'label', 'Detalle', 'before', NULL,
             'after', r.n || ' persona(s) sin asistencia registrada quedaron como asistieron (regla: nadie sin registrar)'))::text,
           CURRENT_TIMESTAMP
      FROM actividades_bienestar a WHERE a.id = r.id;
  END LOOP;
END $$;
