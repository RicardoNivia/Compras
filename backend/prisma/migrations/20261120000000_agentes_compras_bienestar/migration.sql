-- Agentes de compras de Bienestar: propuestas del asociador y cuadros comparativos del cotizador.
-- CreateTable
CREATE TABLE "propuestas_asociacion" (
    "id" SERIAL NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordSeq" INTEGER,
    "actividadId" INTEGER,
    "confianza" TEXT,
    "razon" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "resueltaAt" TIMESTAMP(3),
    "resueltaPorUserId" TEXT,
    "resueltaPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "propuestas_asociacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuadros_comparativos" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "actividadId" INTEGER,
    "datos" JSONB NOT NULL,
    "recomendacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "cuadros_comparativos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "propuestas_asociacion_estado_idx" ON "propuestas_asociacion"("estado");

-- CreateIndex
CREATE INDEX "propuestas_asociacion_recordId_idx" ON "propuestas_asociacion"("recordId");


-- Texto siempre UTF-8 (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('propuestas_asociacion');
SELECT proteger_texto_tabla('cuadros_comparativos');
