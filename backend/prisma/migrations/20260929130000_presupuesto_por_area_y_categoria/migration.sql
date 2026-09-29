-- AlterTable
ALTER TABLE "maestros" DROP COLUMN "presupuestoAnual";

-- CreateTable
CREATE TABLE "presupuestos" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "modo" TEXT NOT NULL,
    "valorArea" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presupuesto_categorias" (
    "id" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "presupuesto_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "presupuestos_area_anio_key" ON "presupuestos"("area", "anio");

-- CreateIndex
CREATE UNIQUE INDEX "presupuesto_categorias_presupuestoId_categoria_key" ON "presupuesto_categorias"("presupuestoId", "categoria");

-- AddForeignKey
ALTER TABLE "presupuesto_categorias" ADD CONSTRAINT "presupuesto_categorias_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "presupuestos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
