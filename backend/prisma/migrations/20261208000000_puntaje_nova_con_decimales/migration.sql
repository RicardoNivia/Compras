-- El puntaje de Nova de una actividad admite un decimal (p. ej. 4.6): un detalle menor resta décimas, no un punto entero.
ALTER TABLE "analisis_actividad" ALTER COLUMN "puntaje" TYPE DOUBLE PRECISION;
