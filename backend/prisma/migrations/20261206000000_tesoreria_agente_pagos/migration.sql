-- Qué agente hizo cada propuesta de asociación: «movimientos» (del movimiento del banco a su pago) o «pagos» (del pago
-- que ya debía estar pagado al movimiento del banco que lo pagó). Cada agente reemplaza solo sus propias pendientes.
-- AlterTable
ALTER TABLE "tesoreria_propuestas_pago" ADD COLUMN     "agente" TEXT NOT NULL DEFAULT 'movimientos';
