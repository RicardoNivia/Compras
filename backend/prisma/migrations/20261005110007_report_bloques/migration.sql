ALTER TABLE "report_configs" ALTER COLUMN "prompt" DROP NOT NULL;
ALTER TABLE "report_configs" ADD COLUMN "bloques" TEXT NOT NULL DEFAULT '[]';
