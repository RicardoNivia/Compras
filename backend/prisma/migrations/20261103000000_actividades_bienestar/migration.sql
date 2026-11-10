-- Módulo de Bienestar: actividades del cronograma y su asociación con las compras (Record.actividadId).

-- AlterTable
ALTER TABLE "records" ADD COLUMN     "actividad" TEXT,
ADD COLUMN     "actividadId" INTEGER;

-- CreateTable
CREATE TABLE "actividades_bienestar" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" TEXT,
    "linea" TEXT NOT NULL DEFAULT 'Bienestar',
    "estado" TEXT NOT NULL DEFAULT 'creada',
    "descripcion" TEXT,
    "responsableUserId" TEXT,
    "responsableNombre" TEXT,
    "presupuesto" DOUBLE PRECISION,
    "inscritos" INTEGER,
    "asistentes" INTEGER,
    "enCronograma" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actividades_bienestar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actividades_bienestar_fecha_idx" ON "actividades_bienestar"("fecha");

-- CreateIndex
CREATE INDEX "records_actividadId_idx" ON "records"("actividadId");

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Texto siempre UTF-8 sin caracteres dañados (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('actividades_bienestar');
