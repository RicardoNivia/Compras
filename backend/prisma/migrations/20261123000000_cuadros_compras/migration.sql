-- Agentes de Compras: el cotizador también se usa en Compras (modulo) y un cuadro puede quedar adjunto a una compra
-- (recordId). Los cuadros que ya existen son de Bienestar (el DEFAULT los deja así). La tabla ya está protegida
-- contra texto dañado desde su migración (agentes_compras_bienestar).
ALTER TABLE "cuadros_comparativos" ADD COLUMN     "modulo" TEXT NOT NULL DEFAULT 'bienestar',
ADD COLUMN     "recordId" TEXT;

CREATE INDEX "cuadros_comparativos_recordId_idx" ON "cuadros_comparativos"("recordId");
