-- Bienestar: participantes (inscripción y asistencia), inventario por actividad, cierre con calificación y formulario público.

-- AlterTable
ALTER TABLE "actividades_bienestar" ADD COLUMN     "calificacion" INTEGER,
ADD COLUMN     "cerradaAt" TIMESTAMP(3),
ADD COLUMN     "cerradaPorNombre" TEXT,
ADD COLUMN     "cerradaPorUserId" TEXT,
ADD COLUMN     "comentarioCierre" TEXT,
ADD COLUMN     "formularioAbierto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "formularioCampos" TEXT,
ADD COLUMN     "formularioToken" TEXT;

-- CreateTable
CREATE TABLE "participantes_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "area" TEXT,
    "correo" TEXT,
    "inscrito" BOOLEAN NOT NULL DEFAULT true,
    "asistio" BOOLEAN,
    "motivoInasistencia" TEXT,
    "calificacion" INTEGER,
    "observacion" TEXT,
    "datos" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "autorizaDatos" BOOLEAN NOT NULL DEFAULT false,
    "autorizaDatosAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participantes_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "item" TEXT NOT NULL,
    "unidad" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "usado" DOUBLE PRECISION,
    "costoUnitario" DOUBLE PRECISION,
    "recordId" TEXT,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participantes_actividad_actividadId_idx" ON "participantes_actividad"("actividadId");

-- CreateIndex
CREATE INDEX "participantes_actividad_documento_idx" ON "participantes_actividad"("documento");

-- CreateIndex
CREATE INDEX "inventario_actividad_actividadId_idx" ON "inventario_actividad"("actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "actividades_bienestar_formularioToken_key" ON "actividades_bienestar"("formularioToken");

-- AddForeignKey
ALTER TABLE "participantes_actividad" ADD CONSTRAINT "participantes_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_actividad" ADD CONSTRAINT "inventario_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Texto siempre UTF-8 sin caracteres dañados (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('participantes_actividad');
SELECT proteger_texto_tabla('inventario_actividad');
