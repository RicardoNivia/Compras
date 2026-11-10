-- Módulo de Tesorería: flujo de caja, soportes, extractos, conciliación y cierre de mes.
-- CreateTable
CREATE TABLE "tesoreria_accesos" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "userNombre" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_accesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_cuentas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ahorros',
    "formatoExtracto" TEXT,
    "saldoInicial" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldoInicialFecha" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_cuentas_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "tesoreria_movimientos" (
    "id" SERIAL NOT NULL,
    "fecha" TEXT NOT NULL,
    "fechaAproximada" BOOLEAN NOT NULL DEFAULT false,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "cuentaDestinoId" INTEGER,
    "itemId" INTEGER,
    "conceptoId" INTEGER,
    "concepto" TEXT NOT NULL,
    "pagadorId" INTEGER,
    "tercero" TEXT,
    "referencia" TEXT,
    "observacion" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_movimientos_pkey" PRIMARY KEY ("id")
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
    "datosLeidos" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_soportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_extractos" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "archivo" TEXT NOT NULL,
    "desde" TEXT,
    "hasta" TEXT,
    "lineasNuevas" INTEGER NOT NULL DEFAULT 0,
    "lineasRepetidas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_extractos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_lineas_extracto" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "extractoId" INTEGER,
    "fecha" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tercero" TEXT,
    "valor" DECIMAL(18,2) NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT,
    "movimientoId" INTEGER,
    "comoSeEnlazo" TEXT,
    "enlazadoAt" TIMESTAMP(3),
    "enlazadoPorNombre" TEXT,
    "ignorada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_lineas_extracto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tesoreria_reglas" (
    "id" SERIAL NOT NULL,
    "patron" TEXT NOT NULL,
    "conceptoId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "pagadorId" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tesoreria_reglas_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "tesoreria_accesos_userId_key" ON "tesoreria_accesos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_cuentas_nombre_key" ON "tesoreria_cuentas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_items_nombre_key" ON "tesoreria_items"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_conceptos_nombre_key" ON "tesoreria_conceptos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_pagadores_nombre_key" ON "tesoreria_pagadores"("nombre");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_fecha_idx" ON "tesoreria_movimientos"("fecha");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_cuentaId_fecha_idx" ON "tesoreria_movimientos"("cuentaId", "fecha");

-- CreateIndex
CREATE INDEX "tesoreria_movimientos_estado_idx" ON "tesoreria_movimientos"("estado");

-- CreateIndex
CREATE INDEX "tesoreria_soportes_sha1_idx" ON "tesoreria_soportes"("sha1");

-- CreateIndex
CREATE INDEX "tesoreria_lineas_extracto_cuentaId_fecha_idx" ON "tesoreria_lineas_extracto"("cuentaId", "fecha");

-- CreateIndex
CREATE INDEX "tesoreria_lineas_extracto_movimientoId_idx" ON "tesoreria_lineas_extracto"("movimientoId");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_lineas_extracto_cuentaId_clave_key" ON "tesoreria_lineas_extracto"("cuentaId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_reglas_patron_key" ON "tesoreria_reglas"("patron");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_cierres_anio_mes_key" ON "tesoreria_cierres"("anio", "mes");

-- AddForeignKey
ALTER TABLE "tesoreria_soportes" ADD CONSTRAINT "tesoreria_soportes_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "tesoreria_movimientos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tesoreria_lineas_extracto" ADD CONSTRAINT "tesoreria_lineas_extracto_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "tesoreria_movimientos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

SELECT proteger_texto_tabla('tesoreria_accesos');
SELECT proteger_texto_tabla('tesoreria_cuentas');
SELECT proteger_texto_tabla('tesoreria_items');
SELECT proteger_texto_tabla('tesoreria_conceptos');
SELECT proteger_texto_tabla('tesoreria_pagadores');
SELECT proteger_texto_tabla('tesoreria_movimientos');
SELECT proteger_texto_tabla('tesoreria_soportes');
SELECT proteger_texto_tabla('tesoreria_extractos');
SELECT proteger_texto_tabla('tesoreria_lineas_extracto');
SELECT proteger_texto_tabla('tesoreria_reglas');
SELECT proteger_texto_tabla('tesoreria_cierres');
