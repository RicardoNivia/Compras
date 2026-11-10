-- Encendido de los agentes automáticos (apagados por defecto).
-- CreateTable
CREATE TABLE "config_agentes" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "actualizadoPorUserId" TEXT,
    "actualizadoPorNombre" TEXT,

    CONSTRAINT "config_agentes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "config_agentes_clave_key" ON "config_agentes"("clave");


SELECT proteger_texto_tabla('config_agentes');
