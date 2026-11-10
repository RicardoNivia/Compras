-- Observaciones que el equipo anota sobre una actividad de Bienestar.
-- CreateTable
CREATE TABLE "observaciones_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "observaciones_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observaciones_actividad_actividadId_idx" ON "observaciones_actividad"("actividadId");

-- AddForeignKey
ALTER TABLE "observaciones_actividad" ADD CONSTRAINT "observaciones_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;


SELECT proteger_texto_tabla('observaciones_actividad');
