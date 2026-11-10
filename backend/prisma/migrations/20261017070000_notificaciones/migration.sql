-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "pedido" TEXT NOT NULL,
    "aclaraciones" TEXT,
    "disparador" TEXT NOT NULL DEFAULT 'programado',
    "fuente" TEXT NOT NULL,
    "consulta" TEXT NOT NULL,
    "parametros" TEXT NOT NULL DEFAULT '{}',
    "alcance" TEXT NOT NULL DEFAULT 'general',
    "condicion" TEXT NOT NULL DEFAULT 'si_hay_resultados',
    "umbral" INTEGER,
    "frecuencia" TEXT,
    "diaSemana" INTEGER,
    "diaMes" INTEGER,
    "ordinal" INTEGER,
    "fechaUnica" TEXT,
    "hora" TEXT,
    "siFestivo" TEXT NOT NULL DEFAULT 'correr',
    "sabadoHabil" BOOLEAN NOT NULL DEFAULT false,
    "domingoHabil" BOOLEAN NOT NULL DEFAULT false,
    "titulo" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL,
    "canales" TEXT NOT NULL DEFAULT '["app"]',
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "motivoPausa" TEXT,
    "pausadaPorUserId" TEXT,
    "pausadaPorNombre" TEXT,
    "pausadaAt" TIMESTAMP(3),
    "propietarioUserId" TEXT NOT NULL,
    "propietarioNombre" TEXT NOT NULL,
    "ultimaEjecucionAt" TIMESTAMP(3),
    "ultimoResultado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_destinatarios" (
    "id" SERIAL NOT NULL,
    "notificacionId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "deBaja" BOOLEAN NOT NULL DEFAULT false,
    "deBajaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificacion_destinatarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_ejecuciones" (
    "id" SERIAL NOT NULL,
    "notificacionId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "resultados" INTEGER NOT NULL DEFAULT 0,
    "contenido" TEXT,
    "error" TEXT,
    "retrasoMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificacion_ejecuciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_entregas" (
    "id" SERIAL NOT NULL,
    "ejecucionId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "motivo" TEXT,
    "contenido" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3),
    "enviadaAt" TIMESTAMP(3),
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "notificacion_entregas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificaciones_estado_disparador_idx" ON "notificaciones"("estado", "disparador");

-- CreateIndex
CREATE INDEX "notificaciones_propietarioUserId_idx" ON "notificaciones"("propietarioUserId");

-- CreateIndex
CREATE INDEX "notificacion_destinatarios_userId_idx" ON "notificacion_destinatarios"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_destinatarios_notificacionId_userId_key" ON "notificacion_destinatarios"("notificacionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_ejecuciones_clave_key" ON "notificacion_ejecuciones"("clave");

-- CreateIndex
CREATE INDEX "notificacion_ejecuciones_notificacionId_createdAt_idx" ON "notificacion_ejecuciones"("notificacionId", "createdAt");

-- CreateIndex
CREATE INDEX "notificacion_entregas_userId_canal_leidaAt_idx" ON "notificacion_entregas"("userId", "canal", "leidaAt");

-- CreateIndex
CREATE INDEX "notificacion_entregas_estado_proximoIntento_idx" ON "notificacion_entregas"("estado", "proximoIntento");

-- AddForeignKey
ALTER TABLE "notificacion_destinatarios" ADD CONSTRAINT "notificacion_destinatarios_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES "notificaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_ejecuciones" ADD CONSTRAINT "notificacion_ejecuciones_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES "notificaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion_entregas" ADD CONSTRAINT "notificacion_entregas_ejecucionId_fkey" FOREIGN KEY ("ejecucionId") REFERENCES "notificacion_ejecuciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Texto siempre UTF-8 (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('notificaciones');
SELECT proteger_texto_tabla('notificacion_destinatarios');
SELECT proteger_texto_tabla('notificacion_ejecuciones');
SELECT proteger_texto_tabla('notificacion_entregas');
