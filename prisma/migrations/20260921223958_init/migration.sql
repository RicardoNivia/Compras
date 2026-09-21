-- CreateTable
CREATE TABLE "records" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "valorConIva" REAL,
    "valorSinIva" REAL,
    "valorCot" REAL,
    "observaciones" TEXT,
    "radicado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "meta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "nextLocalSeq" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL
);
