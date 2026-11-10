-- Correo de Microsoft 365 por persona y solicitudes de proveedor que encuentra el agente de correo.
-- CreateTable
CREATE TABLE "cuentas_correo" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL DEFAULT 'microsoft',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiraAt" TIMESTAMP(3),
    "agenteActivo" BOOLEAN NOT NULL DEFAULT true,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "ultimoError" TEXT,
    "revisadoHasta" TIMESTAMP(3),
    "ultimaRevision" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_correo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correos_revisados" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "correos_revisados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_proveedor_correo" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "webLink" TEXT,
    "remitente" TEXT,
    "asunto" TEXT,
    "recibidoAt" TIMESTAMP(3),
    "resumen" TEXT,
    "datos" TEXT NOT NULL,
    "faltantes" TEXT NOT NULL,
    "notas" TEXT,
    "adjuntos" TEXT,
    "nit" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "proveedorNit" TEXT,
    "motivoDescarte" TEXT,
    "resueltoAt" TIMESTAMP(3),
    "resueltoPorUserId" TEXT,
    "resueltoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_proveedor_correo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_correo_userId_key" ON "cuentas_correo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "correos_revisados_cuentaId_mensajeId_key" ON "correos_revisados"("cuentaId", "mensajeId");

-- CreateIndex
CREATE INDEX "solicitudes_proveedor_correo_userId_estado_idx" ON "solicitudes_proveedor_correo"("userId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_proveedor_correo_userId_mensajeId_key" ON "solicitudes_proveedor_correo"("userId", "mensajeId");


SELECT proteger_texto_tabla('cuentas_correo');
SELECT proteger_texto_tabla('correos_revisados');
SELECT proteger_texto_tabla('solicitudes_proveedor_correo');
