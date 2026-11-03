-- Solicitudes de compra de Bienestar a Compras, desde una actividad ya registrada.
-- CreateTable
CREATE TABLE "solicitudes_compra" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "valorEstimado" DOUBLE PRECISION,
    "categoria" TEXT,
    "categoriaId" TEXT,
    "proveedorSugerido" TEXT,
    "fechaRequerida" TEXT,
    "observaciones" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "motivoRechazo" TEXT,
    "recordId" TEXT,
    "recordSeq" INTEGER,
    "atendidaAt" TIMESTAMP(3),
    "atendidaPorUserId" TEXT,
    "atendidaPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "solicitudes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_compra_estado_idx" ON "solicitudes_compra"("estado");

-- CreateIndex
CREATE INDEX "solicitudes_compra_actividadId_idx" ON "solicitudes_compra"("actividadId");

-- AddForeignKey
ALTER TABLE "solicitudes_compra" ADD CONSTRAINT "solicitudes_compra_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;


SELECT proteger_texto_tabla('solicitudes_compra');
