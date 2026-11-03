-- Bienestar: material fotográfico de cada actividad.

-- CreateTable
CREATE TABLE "fotos_actividad" (
    "id" SERIAL NOT NULL,
    "actividadId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "mime" TEXT NOT NULL,
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "miniatura" BYTEA NOT NULL,
    "hash" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'app',
    "fuente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fotos_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fotos_actividad_actividadId_idx" ON "fotos_actividad"("actividadId");

-- CreateIndex
CREATE UNIQUE INDEX "fotos_actividad_actividadId_hash_key" ON "fotos_actividad"("actividadId", "hash");

-- AddForeignKey
ALTER TABLE "fotos_actividad" ADD CONSTRAINT "fotos_actividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Texto siempre UTF-8 sin caracteres dañados (ver migración texto_sin_caracteres_danados).
SELECT proteger_texto_tabla('fotos_actividad');
