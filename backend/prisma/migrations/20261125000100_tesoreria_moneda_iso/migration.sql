-- Moneda ISO 4217 por cuenta y por movimiento de tesorería (por defecto COP).
-- AlterTable
ALTER TABLE "tesoreria_cuentas" ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'COP';

-- AlterTable
ALTER TABLE "tesoreria_movimientos" ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'COP';

