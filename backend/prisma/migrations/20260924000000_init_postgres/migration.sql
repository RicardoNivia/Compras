-- CreateTable
CREATE TABLE "records" (
    "id" TEXT NOT NULL,
    "localSeq" INTEGER,
    "informe" TEXT,
    "fechaSolicitud" TEXT,
    "fechaEntrega" TEXT,
    "area" TEXT,
    "responsable" TEXT,
    "estado" TEXT,
    "categoria" TEXT,
    "descripcion" TEXT,
    "medioPago" TEXT,
    "licitacion" TEXT,
    "estadoLegalizacion" TEXT,
    "proveedor" TEXT,
    "fe" TEXT,
    "valorConIva" DOUBLE PRECISION,
    "valorSinIva" DOUBLE PRECISION,
    "valorCot" DOUBLE PRECISION,
    "observaciones" TEXT,
    "radicado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "recordInfo" TEXT,
    "userId" TEXT,
    "userNombre" TEXT,
    "userEmail" TEXT,
    "changes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "nextLocalSeq" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maestros" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maestros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "records_localSeq_key" ON "records"("localSeq");

-- CreateIndex
CREATE INDEX "audit_logs_recordId_idx" ON "audit_logs"("recordId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "maestros_tipo_valor_key" ON "maestros"("tipo", "valor");

-- AddForeignKey
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Usuarios administradores por defecto. ON CONFLICT los hace idempotentes
-- (si el email ya existe no falla ni sobrescribe la contraseña actual).
-- Contraseña por defecto: "12345678" (bcrypt, 10 rounds) — debe rotarse.
INSERT INTO "users" ("id", "nombre", "email", "password", "role", "activo", "createdAt", "updatedAt")
VALUES
  ('658e6f43f9394fc799a421bba963fb58', 'Ricardo Nivia', 'ricardo.nivia@sinco.com.co', '$2a$10$1OlWtuHtYrLZ6CDr0p9veulcSij8aN61q/TMezjBQcd.9pQ9wg.Ba', 'admin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d802c1a3cf984532aff9425608a535fa', 'Carolina Daza', 'carolina.daza@sinco.com.co', '$2a$10$1OlWtuHtYrLZ6CDr0p9veulcSij8aN61q/TMezjBQcd.9pQ9wg.Ba', 'admin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Lista fija confirmada por el negocio para cada desplegable.
INSERT INTO "maestros" ("id", "tipo", "valor", "activo", "createdAt", "updatedAt")
SELECT replace(gen_random_uuid()::text, '-', ''), t.tipo, t.valor, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('area', 'Administrativo'),
  ('area', 'Bienestar'),
  ('area', 'CEO'),
  ('area', 'Infraestructura'),
  ('area', 'SST'),
  ('area', 'Gentesoft'),
  ('area', 'Bitakora'),
  ('area', 'Cosmos'),
  ('area', 'Desarrollo'),
  ('area', 'Internacionalización'),
  ('area', 'Jurídico'),
  ('area', 'Sistema de Gestion'),
  ('area', 'Proyectos y servicios'),
  ('responsable', 'Andrea M'),
  ('responsable', 'Yuli M'),
  ('estado', 'Pendiente'),
  ('estado', 'Proceso'),
  ('estado', 'Ejecutado'),
  ('estado', 'Anulado'),
  ('medioPago', 'Transferencia'),
  ('medioPago', 'T. Crédito'),
  ('medioPago', 'C. Menor'),
  ('medioPago', 'Anticipo'),
  ('estadoLegalizacion', 'Acta'),
  ('estadoLegalizacion', 'OC'),
  ('estadoLegalizacion', 'N/A')
) AS t(tipo, valor)
ON CONFLICT DO NOTHING;
