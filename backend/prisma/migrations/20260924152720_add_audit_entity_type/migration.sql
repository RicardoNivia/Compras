-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "entityType" TEXT NOT NULL DEFAULT 'record';

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");
