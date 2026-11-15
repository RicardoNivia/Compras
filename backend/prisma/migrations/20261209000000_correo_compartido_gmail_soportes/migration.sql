-- DropIndex
DROP INDEX "cuentas_correo_userId_key";

-- AlterTable
ALTER TABLE "cuentas_correo" ADD COLUMN     "claveCifrada" TEXT,
ADD COLUMN     "imapUidValidity" TEXT,
ADD COLUMN     "imapUltimoUid" INTEGER,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'personal';

-- CreateTable
CREATE TABLE "tesoreria_soportes_correo" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "indice" INTEGER NOT NULL DEFAULT 0,
    "remitente" TEXT,
    "asunto" TEXT,
    "recibidoAt" TIMESTAMP(3),
    "webLink" TEXT,
    "archivoNombre" TEXT,
    "tipoMime" TEXT,
    "tamano" INTEGER,
    "sha1" TEXT,
    "contenido" BYTEA,
    "leido" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "movimientoId" INTEGER,
    "motivoDescarte" TEXT,
    "resueltoAt" TIMESTAMP(3),
    "resueltoPorUserId" TEXT,
    "resueltoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "tesoreria_soportes_correo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tesoreria_soportes_correo_estado_idx" ON "tesoreria_soportes_correo"("estado");

-- CreateIndex
CREATE INDEX "tesoreria_soportes_correo_sha1_idx" ON "tesoreria_soportes_correo"("sha1");

-- CreateIndex
CREATE UNIQUE INDEX "tesoreria_soportes_correo_cuentaId_mensajeId_indice_key" ON "tesoreria_soportes_correo"("cuentaId", "mensajeId", "indice");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_correo_userId_tipo_key" ON "cuentas_correo"("userId", "tipo");


-- Buzón compartido (Gmail de solicitudes): soportes de pago que llegan por correo. Texto sin caracteres dañados.
SELECT proteger_texto_tabla('tesoreria_soportes_correo');
