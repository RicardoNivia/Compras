-- Años de Tesorería creados a mano desde Gastos periódicos («Crear otro año»).
-- CreateTable
CREATE TABLE "tesoreria_anios" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_anios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_anios_anio_key" ON "tesoreria_anios"("anio");

SELECT proteger_texto_tabla('tesoreria_anios');
