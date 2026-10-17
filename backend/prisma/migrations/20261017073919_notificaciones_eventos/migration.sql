-- AlterTable
ALTER TABLE "notificaciones" ADD COLUMN     "agrupacion" TEXT,
ADD COLUMN     "evento" TEXT;

-- CreateTable
CREATE TABLE "eventos_notificacion" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "datos" TEXT NOT NULL,
    "procesadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "eventos_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eventos_notificacion_clave_key" ON "eventos_notificacion"("clave");

-- CreateIndex
CREATE INDEX "eventos_notificacion_procesadoAt_idx" ON "eventos_notificacion"("procesadoAt");

-- CreateIndex
CREATE INDEX "eventos_notificacion_tipo_createdAt_idx" ON "eventos_notificacion"("tipo", "createdAt");

-- Texto siempre UTF-8 (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('eventos_notificacion');
