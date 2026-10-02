-- Moneda original de la compra (siempre informativa — valorConIva/valorSinIva/valorCot
-- siguen siendo SIEMPRE pesos colombianos). Los registros existentes quedan en "COP"
-- por defecto, que es correcto: todo lo cargado hasta ahora ya estaba en pesos.
ALTER TABLE "records" ADD COLUMN "moneda" TEXT NOT NULL DEFAULT 'COP';
ALTER TABLE "records" ADD COLUMN "valorUsd" DOUBLE PRECISION;
ALTER TABLE "records" ADD COLUMN "trm" DOUBLE PRECISION;
