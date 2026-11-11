-- Conciliación de Tesorería: cada movimiento sabe si el banco lo confirmó (vino del extracto o de la plantilla, o alguien
-- lo confirmó a mano) y de qué extracto; el extracto guarda su saldo inicial y final.
-- AlterTable
ALTER TABLE "tesoreria_extractos" ADD COLUMN     "saldoFinal" DECIMAL(18,2),
ADD COLUMN     "saldoInicial" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "tesoreria_movimientos_banco" ADD COLUMN     "extractoId" INTEGER,
ADD COLUMN     "verificadoAt" TIMESTAMP(3),
ADD COLUMN     "verificadoPorNombre" TEXT;


-- Lo que ya vino del banco (plantilla o extracto) queda verificado desde su carga.
UPDATE "tesoreria_movimientos_banco" SET "verificadoAt" = "createdAt", "verificadoPorNombre" = "creadoPorNombre" WHERE "origen" IN ('importacion', 'extracto') AND "verificadoAt" IS NULL;
