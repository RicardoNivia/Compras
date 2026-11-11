-- Pagos recurrentes de Tesorería: generan solos el proyectado de cada periodo.
-- AlterTable
ALTER TABLE "tesoreria_movimientos" ADD COLUMN     "periodoRecurrencia" TEXT,
ADD COLUMN     "recurrenciaId" INTEGER;

-- CreateTable
CREATE TABLE "tesoreria_recurrencias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "valorVariable" BOOLEAN NOT NULL DEFAULT false,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "cuentaId" INTEGER NOT NULL,
    "cuentaDestinoId" INTEGER,
    "itemId" INTEGER,
    "conceptoId" INTEGER NOT NULL,
    "pagadorId" INTEGER,
    "tercero" TEXT,
    "frecuencia" TEXT NOT NULL DEFAULT 'mensual',
    "diaDelMes" INTEGER NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_recurrencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_movimientos_recurrenciaId_periodoRecurrencia_key" ON "tesoreria_movimientos"("recurrenciaId", "periodoRecurrencia");

-- AddForeignKey
ALTER TABLE "tesoreria_movimientos" ADD CONSTRAINT "tesoreria_movimientos_recurrenciaId_fkey" FOREIGN KEY ("recurrenciaId") REFERENCES "tesoreria_recurrencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

SELECT proteger_texto_tabla('tesoreria_recurrencias');
