-- Revert "enviar el dashboard" mode: back to prompt-only reports.
UPDATE "report_configs" SET "prompt" = COALESCE("prompt", 'Resumen general de compras.') WHERE "prompt" IS NULL;
ALTER TABLE "report_configs" ALTER COLUMN "prompt" SET NOT NULL;
ALTER TABLE "report_configs" DROP COLUMN "modo";
ALTER TABLE "report_configs" DROP COLUMN "periodo";
