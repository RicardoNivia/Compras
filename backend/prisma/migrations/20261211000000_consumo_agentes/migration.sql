-- Agentes de Consumo: el agente de hallazgos guarda lo que encuentra (una vez por clave) y el de reclamaciones
-- guarda el borrador que redacta Nova. La tabla ya estaba protegida contra U+FFFD (consumo_base); el trigger revisa
-- toda la fila, así que cubre las columnas nuevas. No hay filas que rellenar: la tabla no tenía código que la llenara.

-- AlterTable
ALTER TABLE "consumo_hallazgos" ADD COLUMN     "accion" TEXT,
ADD COLUMN     "actualizadoAt" TIMESTAMP(3),
ADD COLUMN     "clave" TEXT,
ADD COLUMN     "confianza" TEXT NOT NULL DEFAULT 'media',
ADD COLUMN     "nota" TEXT,
ADD COLUMN     "radicadaAt" TIMESTAMP(3),
ADD COLUMN     "radicadoNumero" TEXT,
ADD COLUMN     "reclamacion" TEXT,
ADD COLUMN     "reclamacionAt" TIMESTAMP(3),
ADD COLUMN     "reclamacionEstado" TEXT,
ADD COLUMN     "reclamacionPorNombre" TEXT,
ADD COLUMN     "servicio" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "consumo_hallazgos_clave_key" ON "consumo_hallazgos"("clave");

-- CreateIndex
CREATE INDEX "consumo_hallazgos_estado_nivel_idx" ON "consumo_hallazgos"("estado", "nivel");
