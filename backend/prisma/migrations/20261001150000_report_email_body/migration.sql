-- AlterTable
ALTER TABLE "report_configs" ADD COLUMN "cuerpoModo" TEXT NOT NULL DEFAULT 'resumen';
ALTER TABLE "report_configs" ADD COLUMN "cuerpoPrompt" TEXT;
