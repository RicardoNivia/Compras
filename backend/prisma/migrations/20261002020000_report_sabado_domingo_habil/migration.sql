-- AlterTable
ALTER TABLE "report_configs" DROP COLUMN "finDeSemanaHabil";
ALTER TABLE "report_configs" ADD COLUMN "sabadoHabil" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "report_configs" ADD COLUMN "domingoHabil" BOOLEAN NOT NULL DEFAULT false;
