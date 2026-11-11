-- Tesorería desde cero (bancos, movimientos, gastos periódicos y pagos programados, ver schema.prisma).
-- Se borra todo lo anterior del módulo: los datos se cargan subiendo la plantilla de Excel desde la app (no por migración).

DROP TABLE IF EXISTS "tesoreria_lineas_extracto" CASCADE;
DROP TABLE IF EXISTS "tesoreria_reglas" CASCADE;
DROP TABLE IF EXISTS "tesoreria_soportes" CASCADE;
DROP TABLE IF EXISTS "tesoreria_movimientos" CASCADE;
DROP TABLE IF EXISTS "tesoreria_recurrencias" CASCADE;
DROP TABLE IF EXISTS "tesoreria_extractos" CASCADE;
DROP TABLE IF EXISTS "tesoreria_cuentas" CASCADE;
DROP TABLE IF EXISTS "tesoreria_accesos" CASCADE;
DROP TABLE IF EXISTS "tesoreria_items" CASCADE;
DROP TABLE IF EXISTS "tesoreria_conceptos" CASCADE;
DROP TABLE IF EXISTS "tesoreria_pagadores" CASCADE;
DROP TABLE IF EXISTS "tesoreria_cierres" CASCADE;

-- CreateTable
CREATE TABLE "tesoreria_bancos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "numeroCuenta" TEXT,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "formatoExtracto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_bancos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_saldos_iniciales" (
    "id" SERIAL NOT NULL,
    "bancoId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_saldos_iniciales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_saldos_reportados" (
    "id" SERIAL NOT NULL,
    "bancoId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "texto" TEXT,
    "clave" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_saldos_reportados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_medios_pago" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_medios_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_items" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_conceptos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "itemId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_conceptos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_pagadores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_pagadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_movimientos_banco" (
    "id" SERIAL NOT NULL,
    "bancoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "fechaAproximada" BOOLEAN NOT NULL DEFAULT false,
    "descripcion" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "concepto" TEXT,
    "tercero" TEXT,
    "observacion" TEXT,
    "referencia" TEXT,
    "tipoCarga" TEXT,
    "tipoSolicitud" TEXT,
    "preparador" TEXT,
    "formato" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "claveImportacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_movimientos_banco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_soportes" (
    "id" SERIAL NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha1" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_soportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_gastos_periodicos" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "itemId" INTEGER,
    "conceptoId" INTEGER NOT NULL,
    "medioPagoId" INTEGER,
    "pagadorId" INTEGER,
    "valor" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "periodicidad" TEXT NOT NULL,
    "diaCorte" INTEGER NOT NULL,
    "fechaInicio" TEXT NOT NULL,
    "fechaFin" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_gastos_periodicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_pagos_programados" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,
    "fechaAproximada" BOOLEAN NOT NULL DEFAULT false,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'P',
    "estadoPor" TEXT,
    "itemId" INTEGER,
    "conceptoId" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "medioPagoId" INTEGER,
    "pagadorId" INTEGER,
    "valor" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "observacion" TEXT,
    "gastoPeriodicoId" INTEGER,
    "periodo" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "claveImportacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_pagos_programados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_asociaciones" (
    "id" SERIAL NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "pagoId" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_asociaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_propuestas_pago" (
    "id" SERIAL NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "pagoId" INTEGER NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "confianza" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "resueltoPorNombre" TEXT,
    "resueltoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_propuestas_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_alertas" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "refTipo" TEXT,
    "refId" INTEGER,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "resueltaPorNombre" TEXT,
    "resueltaAt" TIMESTAMP(3),
    "clave" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_extractos" (
    "id" SERIAL NOT NULL,
    "bancoId" INTEGER NOT NULL,
    "archivo" TEXT NOT NULL,
    "formato" TEXT,
    "desde" TEXT,
    "hasta" TEXT,
    "nuevos" INTEGER NOT NULL DEFAULT 0,
    "repetidos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_extractos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_cierres" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "saldos" TEXT NOT NULL,
    "firmadoPorUserId" TEXT,
    "firmadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_cierres_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_bancos_nombre_key" ON "tesoreria_bancos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_saldos_iniciales_bancoId_anio_key" ON "tesoreria_saldos_iniciales"("bancoId", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_saldos_reportados_clave_key" ON "tesoreria_saldos_reportados"("clave");

-- CreateIndex
CREATE INDEX "tesoreria_saldos_reportados_bancoId_anio_mes_idx" ON "tesoreria_saldos_reportados"("bancoId", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_medios_pago_nombre_key" ON "tesoreria_medios_pago"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_items_nombre_key" ON "tesoreria_items"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_conceptos_nombre_key" ON "tesoreria_conceptos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_pagadores_nombre_key" ON "tesoreria_pagadores"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_movimientos_banco_claveImportacion_key" ON "tesoreria_movimientos_banco"("claveImportacion");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_banco_bancoId_fecha_idx" ON "tesoreria_movimientos_banco"("bancoId", "fecha");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_banco_fecha_idx" ON "tesoreria_movimientos_banco"("fecha");

-- CreateIndex
CREATE INDEX "tesoreria_soportes_sha1_idx" ON "tesoreria_soportes"("sha1");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_pagos_programados_claveImportacion_key" ON "tesoreria_pagos_programados"("claveImportacion");

-- CreateIndex
CREATE INDEX "tesoreria_pagos_programados_anio_mes_idx" ON "tesoreria_pagos_programados"("anio", "mes");

-- CreateIndex
CREATE INDEX "tesoreria_pagos_programados_estado_idx" ON "tesoreria_pagos_programados"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_pagos_programados_gastoPeriodicoId_periodo_key" ON "tesoreria_pagos_programados"("gastoPeriodicoId", "periodo");

-- CreateIndex
CREATE INDEX "tesoreria_asociaciones_pagoId_idx" ON "tesoreria_asociaciones"("pagoId");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_asociaciones_movimientoId_pagoId_key" ON "tesoreria_asociaciones"("movimientoId", "pagoId");

-- CreateIndex
CREATE INDEX "tesoreria_propuestas_pago_estado_idx" ON "tesoreria_propuestas_pago"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_propuestas_pago_movimientoId_pagoId_key" ON "tesoreria_propuestas_pago"("movimientoId", "pagoId");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_alertas_clave_key" ON "tesoreria_alertas"("clave");

-- CreateIndex
CREATE INDEX "tesoreria_alertas_resuelta_idx" ON "tesoreria_alertas"("resuelta");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_cierres_anio_mes_key" ON "tesoreria_cierres"("anio", "mes");

-- AddForeignKey
ALTER TABLE "tesoreria_saldos_iniciales" ADD CONSTRAINT "tesoreria_saldos_iniciales_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "tesoreria_bancos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_saldos_reportados" ADD CONSTRAINT "tesoreria_saldos_reportados_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "tesoreria_bancos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_movimientos_banco" ADD CONSTRAINT "tesoreria_movimientos_banco_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "tesoreria_bancos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_soportes" ADD CONSTRAINT "tesoreria_soportes_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "tesoreria_movimientos_banco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_pagos_programados" ADD CONSTRAINT "tesoreria_pagos_programados_gastoPeriodicoId_fkey" FOREIGN KEY ("gastoPeriodicoId") REFERENCES "tesoreria_gastos_periodicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_asociaciones" ADD CONSTRAINT "tesoreria_asociaciones_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "tesoreria_movimientos_banco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_asociaciones" ADD CONSTRAINT "tesoreria_asociaciones_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "tesoreria_pagos_programados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_propuestas_pago" ADD CONSTRAINT "tesoreria_propuestas_pago_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "tesoreria_movimientos_banco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_propuestas_pago" ADD CONSTRAINT "tesoreria_propuestas_pago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "tesoreria_pagos_programados"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ningún texto con el carácter dañado U+FFFD (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('tesoreria_bancos');
SELECT proteger_texto_tabla('tesoreria_saldos_iniciales');
SELECT proteger_texto_tabla('tesoreria_saldos_reportados');
SELECT proteger_texto_tabla('tesoreria_medios_pago');
SELECT proteger_texto_tabla('tesoreria_items');
SELECT proteger_texto_tabla('tesoreria_conceptos');
SELECT proteger_texto_tabla('tesoreria_pagadores');
SELECT proteger_texto_tabla('tesoreria_movimientos_banco');
SELECT proteger_texto_tabla('tesoreria_soportes');
SELECT proteger_texto_tabla('tesoreria_gastos_periodicos');
SELECT proteger_texto_tabla('tesoreria_pagos_programados');
SELECT proteger_texto_tabla('tesoreria_asociaciones');
SELECT proteger_texto_tabla('tesoreria_propuestas_pago');
SELECT proteger_texto_tabla('tesoreria_alertas');
SELECT proteger_texto_tabla('tesoreria_extractos');
SELECT proteger_texto_tabla('tesoreria_cierres');
