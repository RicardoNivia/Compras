-- Análisis de Nova de cada actividad, con su propio puntaje de 1 a 5.
-- CreateTable
CREATE TABLE "analisis_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "puntaje" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "puntos" JSONB NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'cierre',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "analisis_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analisis_actividad_actividadId_key" ON "analisis_actividad"("actividadId");

-- AddForeignKey
ALTER TABLE "analisis_actividad" ADD CONSTRAINT "analisis_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;


SELECT proteger_texto_tabla('analisis_actividad');
