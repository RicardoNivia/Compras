-- Tono de cada comentario de Bienestar según Nova (positivo / neutro / negativo / no_aplica). Lo llena lib/sentimientoComentarios.js.
-- AlterTable
ALTER TABLE "actividades_bienestar" ADD COLUMN     "sentimientoCierre" TEXT,
ADD COLUMN     "sentimientoObservaciones" TEXT;

-- AlterTable
ALTER TABLE "observaciones_actividad" ADD COLUMN     "sentimiento" TEXT;

-- AlterTable
ALTER TABLE "participantes_actividad" ADD COLUMN     "sentimiento" TEXT;

