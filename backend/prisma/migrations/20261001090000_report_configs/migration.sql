-- CreateTable
CREATE TABLE "report_configs" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "destinatarios" TEXT NOT NULL,
    "frecuencia" TEXT NOT NULL,
    "diaSemana" INTEGER,
    "diaMes" INTEGER,
    "hora" TEXT NOT NULL,
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoContenido" TEXT,
    "ultimoEnvio" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdByNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_configs_pkey" PRIMARY KEY ("id")
);
