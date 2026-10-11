-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "area" TEXT,
ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "criticidad" TEXT,
ADD COLUMN     "esExcepcion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inactivoMotivo" TEXT,
ADD COLUMN     "justificacionExcepcion" TEXT,
ADD COLUMN     "motivoExcepcion" TEXT,
ADD COLUMN     "motivoExcepcionId" TEXT,
ADD COLUMN     "servicio" TEXT;

-- CreateTable
CREATE TABLE "proveedor_ciclos" (
    "id" SERIAL NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "clasificacion" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "aprobadoPorUserId" TEXT,
    "aprobadoPorNombre" TEXT,
    "aprobadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_ciclos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor_ciclo_documentos" (
    "id" SERIAL NOT NULL,
    "cicloId" INTEGER NOT NULL,
    "clave" TEXT NOT NULL,
    "cumple" BOOLEAN NOT NULL DEFAULT false,
    "verificadoPorUserId" TEXT,
    "verificadoPorNombre" TEXT,
    "verificadoAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_ciclo_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_proveedores" (
    "id" SERIAL NOT NULL,
    "diaCorte" INTEGER NOT NULL DEFAULT 31,
    "mesCorte" INTEGER NOT NULL DEFAULT 3,
    "diasAviso" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclos_proveedor_iniciados" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "iniciadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cantidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ciclos_proveedor_iniciados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_ciclos_proveedorId_anio_key" ON "proveedor_ciclos"("proveedorId", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_ciclo_documentos_cicloId_clave_key" ON "proveedor_ciclo_documentos"("cicloId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "ciclos_proveedor_iniciados_anio_key" ON "ciclos_proveedor_iniciados"("anio");

-- AddForeignKey
ALTER TABLE "proveedor_ciclos" ADD CONSTRAINT "proveedor_ciclos_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor_ciclo_documentos" ADD CONSTRAINT "proveedor_ciclo_documentos_cicloId_fkey" FOREIGN KEY ("cicloId") REFERENCES "proveedor_ciclos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

