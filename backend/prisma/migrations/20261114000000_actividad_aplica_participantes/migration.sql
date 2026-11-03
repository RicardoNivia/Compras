-- Actividades que no manejan participantes ni listas de asistencia. Las existentes siguen aplicando.
-- AlterTable
ALTER TABLE "actividades_bienestar" ADD COLUMN     "aplicaParticipantes" BOOLEAN NOT NULL DEFAULT true;

