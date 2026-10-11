-- Causas de calificación por defecto (maestro "causaCalificacion"), una
-- lista inicial administrable por el admin en Maestros — igual patrón que
-- la lista fija de área/estado/medioPago/estadoLegalizacion sembrada en
-- 20260924000000_init_postgres. aplicaEstrellas fija a qué calificación
-- (1 a 4) aplica cada causa; 5 estrellas nunca pide causa.
INSERT INTO "maestros" ("id", "tipo", "valor", "aplicaEstrellas", "activo", "createdAt", "updatedAt")
SELECT replace(gen_random_uuid()::text, '-', ''), t.tipo, t.valor, t."aplicaEstrellas", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('causaCalificacion', 'Producto o servicio no entregado', 1),
  ('causaCalificacion', 'Incumplimiento total del acuerdo', 1),
  ('causaCalificacion', 'Fraude o conducta indebida', 1),
  ('causaCalificacion', 'Producto o servicio con fallas graves', 1),
  ('causaCalificacion', 'Entrega con retraso muy prolongado', 2),
  ('causaCalificacion', 'Calidad muy por debajo de lo acordado', 2),
  ('causaCalificacion', 'Mala comunicación o atención', 2),
  ('causaCalificacion', 'Precio final distinto al cotizado', 2),
  ('causaCalificacion', 'Entrega tardía', 3),
  ('causaCalificacion', 'Calidad regular, no cumple del todo lo esperado', 3),
  ('causaCalificacion', 'Precio poco competitivo', 3),
  ('causaCalificacion', 'Documentación incompleta o con errores', 3),
  ('causaCalificacion', 'Pequeño retraso en la entrega', 4),
  ('causaCalificacion', 'Detalles menores de calidad', 4),
  ('causaCalificacion', 'Comunicación mejorable', 4),
  ('causaCalificacion', 'Documentación con detalles por corregir', 4)
) AS t(tipo, valor, "aplicaEstrellas")
ON CONFLICT DO NOTHING;
