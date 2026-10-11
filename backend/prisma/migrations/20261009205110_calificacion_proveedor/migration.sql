-- AlterTable
ALTER TABLE "maestros" ADD COLUMN     "aplicaEstrellas" INTEGER;

-- CreateTable
CREATE TABLE "calificaciones_proveedor" (
    "id" SERIAL NOT NULL,
    "recordId" TEXT NOT NULL,
    "proveedorId" TEXT,
    "proveedor" TEXT,
    "estrellas" INTEGER NOT NULL,
    "causasIds" TEXT,
    "comentario" TEXT,
    "calificadoPorUserId" TEXT,
    "calificadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calificaciones_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calificaciones_proveedor_recordId_key" ON "calificaciones_proveedor"("recordId");

-- AddForeignKey
ALTER TABLE "calificaciones_proveedor" ADD CONSTRAINT "calificaciones_proveedor_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
