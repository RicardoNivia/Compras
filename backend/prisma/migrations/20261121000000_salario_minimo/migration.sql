-- Salario mínimo (SMMLV) por año, en Maestros de Compras, para el umbral del cuadro comparativo (agente cotizador).
-- CreateTable
CREATE TABLE "salarios_minimos" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "norma" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "actualizadoPorNombre" TEXT,

    CONSTRAINT "salarios_minimos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salarios_minimos_anio_key" ON "salarios_minimos"("anio");


SELECT proteger_texto_tabla('salarios_minimos');

-- Valores oficiales: 2025 (Decreto 1572 de 2024) y 2026 (Decreto 1469 de 2025, ratificado por el Decreto 0159 de 2026).
INSERT INTO "salarios_minimos" ("anio", "valor", "norma", "updatedAt", "creadoPorNombre") VALUES
  (2025, 1423500, 'Decreto 1572 de 2024', now(), 'Migración histórica'),
  (2026, 1750905, 'Decreto 1469 de 2025 (ratificado por el Decreto 0159 de 2026)', now(), 'Migración histórica')
ON CONFLICT ("anio") DO NOTHING;
