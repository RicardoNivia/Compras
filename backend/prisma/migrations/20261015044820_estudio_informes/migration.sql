-- AlterTable
ALTER TABLE "report_configs" ADD COLUMN     "asunto" TEXT,
ADD COLUMN     "condicion" TEXT NOT NULL DEFAULT 'siempre',
ADD COLUMN     "contexto" TEXT,
ADD COLUMN     "entrega" TEXT NOT NULL DEFAULT 'yo',
ADD COLUMN     "fechaUnica" TEXT,
ADD COLUMN     "mensaje" TEXT,
ADD COLUMN     "ordinal" INTEGER,
ADD COLUMN     "pedido" TEXT,
ADD COLUMN     "reglaTexto" TEXT,
ADD COLUMN     "responsables" TEXT,
ADD COLUMN     "saltarFestivos" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "report_ediciones" (
    "id" SERIAL NOT NULL,
    "reportId" TEXT NOT NULL,
    "periodoLabel" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'programado',
    "estado" TEXT NOT NULL,
    "motivo" TEXT,
    "contenido" TEXT,
    "pdf" BYTEA,
    "asunto" TEXT,
    "mensaje" TEXT,
    "destinatarios" TEXT,
    "cc" TEXT,
    "resumen" TEXT,
    "descargadoAt" TIMESTAMP(3),
    "enviadoAt" TIMESTAMP(3),
    "enviadoPorUserId" TEXT,
    "enviadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "report_ediciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_ediciones_reportId_createdAt_idx" ON "report_ediciones"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "report_ediciones_estado_idx" ON "report_ediciones"("estado");

-- AddForeignKey
ALTER TABLE "report_ediciones" ADD CONSTRAINT "report_ediciones_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
