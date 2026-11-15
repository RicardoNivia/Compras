-- CreateTable
CREATE TABLE "consumo_sedes" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "edificio" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumo_sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_empresas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "servicios" TEXT NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumo_empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_cuentas" (
    "id" SERIAL NOT NULL,
    "sedeId" INTEGER NOT NULL,
    "servicio" TEXT NOT NULL,
    "empresaId" INTEGER,
    "numeroCuenta" TEXT,
    "titular" TEXT,
    "claseUso" TEXT,
    "estrato" TEXT,
    "periodicidad" TEXT NOT NULL DEFAULT 'mensual',
    "direccionRecibo" TEXT,
    "noAplica" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumo_cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_medidores" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "desde" TEXT,
    "hasta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "consumo_medidores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_recibos" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "medidorId" INTEGER,
    "numeroFactura" TEXT,
    "periodoDesde" TEXT NOT NULL,
    "periodoHasta" TEXT NOT NULL,
    "dias" INTEGER,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipoLectura" TEXT NOT NULL DEFAULT 'real',
    "lecturaAnterior" DECIMAL(18,4),
    "lecturaActual" DECIMAL(18,4),
    "factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "consumo" DECIMAL(18,4),
    "unidad" TEXT NOT NULL DEFAULT 'kWh',
    "vigenciaTarifa" TEXT,
    "valorUnitario" DECIMAL(18,4),
    "totalCargos" DECIMAL(18,2) NOT NULL,
    "saldoAnterior" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPagar" DECIMAL(18,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "fechaExpedicion" TEXT,
    "fechaPagoOportuno" TEXT,
    "fechaSuspension" TEXT,
    "estadoPago" TEXT NOT NULL DEFAULT 'pendiente',
    "valorPagado" DECIMAL(18,2),
    "fechaPago" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "extras" TEXT,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumo_recibos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_recibo_cargos" (
    "id" SERIAL NOT NULL,
    "reciboId" INTEGER NOT NULL,
    "grupo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "cantidad" DECIMAL(18,4),
    "valorUnitario" DECIMAL(18,4),
    "valor" DECIMAL(18,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "consumo_recibo_cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_recibo_historial" (
    "id" SERIAL NOT NULL,
    "reciboId" INTEGER NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "etiqueta" TEXT,
    "consumo" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "consumo_recibo_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_soportes" (
    "id" SERIAL NOT NULL,
    "reciboId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "sha1" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "consumo_soportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_hallazgos" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'media',
    "sedeId" INTEGER NOT NULL,
    "reciboId" INTEGER,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "valor" DECIMAL(18,2),
    "moneda" TEXT NOT NULL DEFAULT 'COP',
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "resueltoAt" TIMESTAMP(3),
    "resueltoPorUserId" TEXT,
    "resueltoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "consumo_hallazgos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumo_sedes_nombre_key" ON "consumo_sedes"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "consumo_empresas_nombre_key" ON "consumo_empresas"("nombre");

-- CreateIndex
CREATE INDEX "consumo_cuentas_sedeId_idx" ON "consumo_cuentas"("sedeId");

-- CreateIndex
CREATE INDEX "consumo_cuentas_servicio_numeroCuenta_idx" ON "consumo_cuentas"("servicio", "numeroCuenta");

-- CreateIndex
CREATE INDEX "consumo_medidores_cuentaId_idx" ON "consumo_medidores"("cuentaId");

-- CreateIndex
CREATE INDEX "consumo_medidores_numero_idx" ON "consumo_medidores"("numero");

-- CreateIndex
CREATE INDEX "consumo_recibos_cuentaId_anio_mes_idx" ON "consumo_recibos"("cuentaId", "anio", "mes");

-- CreateIndex
CREATE INDEX "consumo_recibos_estadoPago_idx" ON "consumo_recibos"("estadoPago");

-- CreateIndex
CREATE INDEX "consumo_recibo_cargos_reciboId_idx" ON "consumo_recibo_cargos"("reciboId");

-- CreateIndex
CREATE INDEX "consumo_recibo_historial_cuentaId_anio_mes_idx" ON "consumo_recibo_historial"("cuentaId", "anio", "mes");

-- CreateIndex
CREATE INDEX "consumo_recibo_historial_reciboId_idx" ON "consumo_recibo_historial"("reciboId");

-- CreateIndex
CREATE INDEX "consumo_soportes_sha1_idx" ON "consumo_soportes"("sha1");

-- CreateIndex
CREATE INDEX "consumo_soportes_reciboId_idx" ON "consumo_soportes"("reciboId");

-- CreateIndex
CREATE INDEX "consumo_hallazgos_sedeId_estado_idx" ON "consumo_hallazgos"("sedeId", "estado");

-- AddForeignKey
ALTER TABLE "consumo_cuentas" ADD CONSTRAINT "consumo_cuentas_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "consumo_sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_cuentas" ADD CONSTRAINT "consumo_cuentas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "consumo_empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_medidores" ADD CONSTRAINT "consumo_medidores_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "consumo_cuentas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_recibos" ADD CONSTRAINT "consumo_recibos_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "consumo_cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_recibos" ADD CONSTRAINT "consumo_recibos_medidorId_fkey" FOREIGN KEY ("medidorId") REFERENCES "consumo_medidores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_recibo_cargos" ADD CONSTRAINT "consumo_recibo_cargos_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "consumo_recibos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_recibo_historial" ADD CONSTRAINT "consumo_recibo_historial_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "consumo_recibos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_soportes" ADD CONSTRAINT "consumo_soportes_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "consumo_recibos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_hallazgos" ADD CONSTRAINT "consumo_hallazgos_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "consumo_sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_hallazgos" ADD CONSTRAINT "consumo_hallazgos_reciboId_fkey" FOREIGN KEY ("reciboId") REFERENCES "consumo_recibos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Texto siempre sano (U+FFFD rechazado) en todas las tablas del módulo.
SELECT proteger_texto_tabla('consumo_sedes');
SELECT proteger_texto_tabla('consumo_empresas');
SELECT proteger_texto_tabla('consumo_cuentas');
SELECT proteger_texto_tabla('consumo_medidores');
SELECT proteger_texto_tabla('consumo_recibos');
SELECT proteger_texto_tabla('consumo_recibo_cargos');
SELECT proteger_texto_tabla('consumo_recibo_historial');
SELECT proteger_texto_tabla('consumo_soportes');
SELECT proteger_texto_tabla('consumo_hallazgos');

-- Sedes iniciales: las de los recibos de ejemplo (Enel y Acueducto) más Mesa de Yeguas.
INSERT INTO "consumo_sedes" ("nombre", "edificio", "direccion", "ciudad", "creadoPorNombre", "updatedAt") VALUES
  ('CL 81 # 11-08 · OF 1001', 'CL 81 # 11-08', 'CL 81 # 11-08 OF 1001', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('CL 81 # 11-08 · OF 1002', 'CL 81 # 11-08', 'CL 81 # 11-08 OF 1002', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('CL 81 # 11-08 · OF 1003', 'CL 81 # 11-08', 'CL 81 # 11-08 OF 1003', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('CL 81 # 11-08 · OF 1004', 'CL 81 # 11-08', 'CL 81 # 11-08 OF 1004', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('KR 12A # 79-08 · OF 203', 'KR 12A # 79-08', 'KR 12A # 79-08 OF 203', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('KR 12A # 79-08 · OF 204', 'KR 12A # 79-08', 'KR 12A # 79-08 OF 204', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('KR 12A # 79-08 · OF 402', 'KR 12A # 79-08', 'KR 12A # 79-08 OF 402', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('KR 12 # 79-50 · OF 501', 'KR 12 # 79-50', 'KR 12 # 79-50 OF 501', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('KR 12 # 79-50 · OF 502', 'KR 12 # 79-50', 'KR 12 # 79-50 OF 502', 'Bogotá, D.C.', 'Migración histórica', CURRENT_TIMESTAMP),
  ('Mesa de Yeguas', 'Anapoima', 'Club Mesa de Yeguas LT Z 30', 'Anapoima', 'Migración histórica', CURRENT_TIMESTAMP);

-- Empresas de servicios de esos recibos.
INSERT INTO "consumo_empresas" ("nombre", "nit", "servicios", "creadoPorNombre", "updatedAt") VALUES
  ('Enel Colombia', '860.063.875-8', 'energia', 'Migración histórica', CURRENT_TIMESTAMP),
  ('Acueducto de Bogotá (EAAB)', '899.999.094-1', 'acueducto', 'Migración histórica', CURRENT_TIMESTAMP),
  ('Vanti', NULL, 'gas', 'Migración histórica', CURRENT_TIMESTAMP),
  ('Promoambiental Distrito', '901.145.808-5', 'aseo', 'Migración histórica', CURRENT_TIMESTAMP);

