-- Avisos directos en la Bandeja, sin regla de notificación (p. ej. solicitudes de compra).
-- AlterTable
ALTER TABLE "notificacion_entregas" ALTER COLUMN "ejecucionId" DROP NOT NULL;

