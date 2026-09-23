-- AlterTable
ALTER TABLE "records" ADD COLUMN "localSeq" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "records_localSeq_key" ON "records"("localSeq");
