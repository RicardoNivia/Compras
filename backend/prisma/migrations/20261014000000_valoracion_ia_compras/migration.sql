-- CreateTable
CREATE TABLE "valoraciones_compra" (
    "id" SERIAL NOT NULL,
    "recordId" TEXT NOT NULL,
    "puntajeCompra" INTEGER NOT NULL,
    "puntajeProveedor" INTEGER,
    "resumen" TEXT NOT NULL,
    "observacionCompra" TEXT NOT NULL,
    "observacionProveedor" TEXT,
    "factores" TEXT,
    "comprasPrevias" INTEGER NOT NULL DEFAULT 0,
    "modelo" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'radicacion',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "valoraciones_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "valoraciones_compra_recordId_key" ON "valoraciones_compra"("recordId");

-- AddForeignKey
ALTER TABLE "valoraciones_compra" ADD CONSTRAINT "valoraciones_compra_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

