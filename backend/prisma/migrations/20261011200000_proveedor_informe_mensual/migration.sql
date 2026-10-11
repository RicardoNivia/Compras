-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "fechaActualizacion" TIMESTAMP(3),
ADD COLUMN     "fechaExcepcion" TIMESTAMP(3),
ADD COLUMN     "radicaFacturas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "radicaFacturasAt" TIMESTAMP(3);

