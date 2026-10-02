-- AlterTable
ALTER TABLE "report_configs" ALTER COLUMN "prompt" DROP NOT NULL;
ALTER TABLE "report_configs" ADD COLUMN "modo" TEXT NOT NULL DEFAULT 'prompt';
ALTER TABLE "report_configs" ADD COLUMN "periodo" TEXT;
