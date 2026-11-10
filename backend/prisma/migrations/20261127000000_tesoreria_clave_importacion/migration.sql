-- Huella de la fila del Excel en cada movimiento importado: volver a importar la plantilla no duplica.
-- AlterTable
ALTER TABLE "tesoreria_movimientos" ADD COLUMN     "claveImportacion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_movimientos_claveImportacion_key" ON "tesoreria_movimientos"("claveImportacion");

