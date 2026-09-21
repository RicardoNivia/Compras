-- CreateTable
CREATE TABLE "purchase_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "informe" TEXT,
    "fechaSolicitud" DATETIME,
    "fechaEntrega" DATETIME,
    "area" TEXT,
    "responsable" TEXT,
    "estado" TEXT,
    "categoria" TEXT,
    "descripcion" TEXT NOT NULL,
    "medioPago" TEXT,
    "licitacion" TEXT,
    "estadoLegalizacion" TEXT,
    "proveedor" TEXT,
    "fe" TEXT,
    "valorConIva" REAL,
    "valorSinIva" REAL,
    "valorCot" REAL,
    "observaciones" TEXT,
    "radicado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
