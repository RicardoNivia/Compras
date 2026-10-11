-- Campos de ADM-P-01 (Procedimiento de compras): proveedor internacional,
-- vinculación liviana por excepción de correo, y evaluación anual de críticos.

ALTER TABLE "proveedores" ADD COLUMN "internacional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proveedores" ADD COLUMN "ultimaEvaluacionCriticoFecha" TIMESTAMP(3);
ALTER TABLE "proveedores" ADD COLUMN "ultimaEvaluacionCriticoResultado" TEXT;

ALTER TABLE "proveedor_procesos" ADD COLUMN "viaExcepcionCorreo" BOOLEAN NOT NULL DEFAULT false;
