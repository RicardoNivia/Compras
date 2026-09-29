-- AlterTable
ALTER TABLE "presupuestos" DROP COLUMN "modo";

-- CreateTable
CREATE TABLE "presupuesto_anios" (
    "anio" INTEGER NOT NULL,
    "modo" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presupuesto_anios_pkey" PRIMARY KEY ("anio")
);
