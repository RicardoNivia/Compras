-- CreateTable
CREATE TABLE "tokens_acceso" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraAt" TIMESTAMP(3),
    "ultimoUsoAt" TIMESTAMP(3),
    "usos" INTEGER NOT NULL DEFAULT 0,
    "revocadoAt" TIMESTAMP(3),
    "revocadoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tokens_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_acceso_tokenHash_key" ON "tokens_acceso"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_acceso_userId_idx" ON "tokens_acceso"("userId");
