-- Análisis de Nova del Resumen de Bienestar (mensual y general), generado el día 1 de cada mes o a pedido.
-- CreateTable
CREATE TABLE "analisis_bienestar" (
    "id" SERIAL NOT NULL,
    "linea" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "puntos" JSONB NOT NULL,
    "corte" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'automatico',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "analisis_bienestar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analisis_bienestar_linea_anio_mes_key" ON "analisis_bienestar"("linea", "anio", "mes");


SELECT proteger_texto_tabla('analisis_bienestar');
