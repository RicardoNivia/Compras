-- Gestión de Proveedores: historial de procesos (actualización/nuevo/excepción) y checklist de compras.

CREATE TABLE "proveedor_procesos" (
    "id" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "proceso" TEXT NOT NULL,
    "estado" TEXT,
    "estadoId" TEXT,
    "fecha" TIMESTAMP(3),
    "revision" TEXT,
    "contacto" TEXT,
    "observacion" TEXT,
    "criticidad" TEXT,
    "clasificacion" TEXT,
    "area" TEXT,
    "areaId" TEXT,
    "servicio" TEXT,
    "servicioId" TEXT,
    "radicado" BOOLEAN NOT NULL DEFAULT false,
    "radicadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_procesos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proveedor_procesos_proveedorId_idx" ON "proveedor_procesos"("proveedorId");
CREATE INDEX "proveedor_procesos_proceso_idx" ON "proveedor_procesos"("proceso");

ALTER TABLE "proveedor_procesos" ADD CONSTRAINT "proveedor_procesos_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "proveedor_checklists" (
    "proveedorId" TEXT NOT NULL,
    "rutVigente" BOOLEAN NOT NULL DEFAULT false,
    "certBancaria" BOOLEAN NOT NULL DEFAULT false,
    "listasRestr" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedor_checklists_pkey" PRIMARY KEY ("proveedorId")
);

ALTER TABLE "proveedor_checklists" ADD CONSTRAINT "proveedor_checklists_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
