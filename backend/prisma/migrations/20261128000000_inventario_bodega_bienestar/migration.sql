-- AlterTable
ALTER TABLE "inventario_actividad" ADD COLUMN     "articuloId" INTEGER;

-- CreateTable
CREATE TABLE "inventario_articulos" (
    "id" SERIAL NOT NULL,
    "bodega" TEXT NOT NULL,
    "referencia" TEXT,
    "producto" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'Unidad',
    "minimo" INTEGER,
    "vence" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_articulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_movimientos" (
    "id" SERIAL NOT NULL,
    "articuloId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "stockAntes" INTEGER NOT NULL,
    "stockDespues" INTEGER NOT NULL,
    "motivo" TEXT,
    "recordId" TEXT,
    "actividadId" INTEGER,
    "inventarioActividadId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorUserId" TEXT,
    "creadoPorNombre" TEXT,

    CONSTRAINT "inventario_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventario_articulos_bodega_idx" ON "inventario_articulos"("bodega");

-- CreateIndex
CREATE INDEX "inventario_movimientos_articuloId_createdAt_idx" ON "inventario_movimientos"("articuloId", "createdAt");

-- CreateIndex
CREATE INDEX "inventario_movimientos_recordId_idx" ON "inventario_movimientos"("recordId");

-- CreateIndex
CREATE INDEX "inventario_movimientos_actividadId_idx" ON "inventario_movimientos"("actividadId");

-- CreateIndex
CREATE INDEX "inventario_actividad_articuloId_idx" ON "inventario_actividad"("articuloId");

-- AddForeignKey
ALTER TABLE "inventario_actividad" ADD CONSTRAINT "inventario_actividad_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "inventario_articulos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "inventario_articulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "actividades_bienestar"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Texto siempre UTF-8 (trigger trg_texto_sin_danos)
SELECT proteger_texto_tabla('inventario_articulos');
SELECT proteger_texto_tabla('inventario_movimientos');

-- Carga inicial: los 63 artículos de la pestaña «Inventario Bodega» del Excel «BIENESTAR GENERAL 2026»
-- (53 de Bodega, 2 de SST y 8 de Desechables y aseo), con su cantidad inicial, entradas y salidas como
-- movimientos. Solo si la tabla está vacía, así nunca duplica.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventario_articulos) THEN
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (1, 'bodega', '1', 'MEGA LONCHERA', 'Unidad', NULL, '2026-11-26', 60, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (1, 'inicial', 60, 0, 60, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (2, 'bodega', '2', 'CREMA DE MANOS', 'Unidad', NULL, '2026-12-01', 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (2, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (3, 'bodega', '3', 'BOCADILLO', 'Unidad', NULL, '2026-12-05', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (3, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (4, 'bodega', '4', 'BOCADILLO', 'Unidad', NULL, '2027-01-12', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (4, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (5, 'bodega', '5', 'BOCADILLO', 'Unidad', NULL, '2027-01-21', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (5, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (6, 'bodega', '6', 'GALLETAS FESTIVAL', 'Unidad', NULL, '2027-01-28', 72, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (6, 'inicial', 72, 0, 72, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (7, 'bodega', '7', 'GALLETAS OREO', 'Unidad', NULL, '2026-07-27', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (7, 'inicial', 26, 0, 26, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (7, 'salida', -26, 26, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (8, 'bodega', '8', 'MINICHIPS', 'Unidad', NULL, '2027-05-13', 24, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (8, 'inicial', 24, 0, 24, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (9, 'bodega', '9', 'MINICHIPS', 'Unidad', NULL, '2027-06-10', 24, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (9, 'inicial', 24, 0, 24, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (10, 'bodega', '10', 'MINICHIPS', 'Unidad', NULL, '2027-02-11', 13, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (10, 'inicial', 13, 0, 13, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (11, 'bodega', '11', 'MINICHIPS', 'Unidad', NULL, '2026-11-05', 8, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (11, 'inicial', 8, 0, 8, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (12, 'bodega', NULL, 'BROWNIE', 'Unidad', NULL, '2026-11-25', 45, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (12, 'inicial', 45, 0, 45, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (13, 'bodega', '12', 'SALSA MAYONESA', 'Unidad', NULL, '2026-11-21', 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (13, 'inicial', 1, 0, 1, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (14, 'bodega', '13', 'SALSA TOMATE', 'Unidad', NULL, '2027-05-14', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (14, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (15, 'bodega', '14', 'SALSA TARTARA', 'Unidad', NULL, '2026-12-24', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (15, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (16, 'bodega', '15', 'SALSA BBQ', 'Unidad', NULL, '2026-07-31', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (16, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (17, 'bodega', '16', 'GASEOSA 3 LT', 'Unidad', NULL, '2026-11-30', 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (17, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (17, 'salida', -1, 2, 1, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (18, 'bodega', '17', 'GASEOSA SPRITE 3L', 'Unidad', NULL, '2026-12-03', 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (18, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (18, 'salida', -1, 2, 1, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (19, 'bodega', '18', 'GASEOSA 3L COCACOLA', 'Unidad', NULL, '2026-12-15', 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (19, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (20, 'bodega', '19', 'GASEOSA 1.5 LT', 'Unidad', NULL, '2026-12-20', 3, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (20, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (21, 'bodega', NULL, 'GASEOSA 1.5 LT', 'Unidad', NULL, '2026-12-21', 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (21, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (22, 'bodega', '20', 'CLUB SOCIAL', 'Unidad', NULL, '2026-08-09', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (22, 'inicial', 37, 0, 37, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (22, 'salida', -37, 37, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (23, 'bodega', '21', 'GALLETAS WAFER FRESA', 'Unidad', NULL, '2026-06-03', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (23, 'inicial', 24, 0, 24, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (23, 'salida', -24, 24, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (24, 'bodega', '22', 'GALLETAS WAFER VAINILLA', 'Unidad', NULL, '2026-05-27', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (24, 'inicial', 54, 0, 54, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (24, 'salida', -54, 54, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (25, 'bodega', '23', 'JUGOS TEA HATSU', 'Unidad', NULL, '2027-03-10', 12, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (25, 'inicial', 36, 0, 36, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (25, 'salida', -24, 36, 12, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (26, 'bodega', '24', 'JUGOS', 'Unidad', NULL, '2026-11-10', 6, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (26, 'inicial', 43, 0, 43, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (26, 'salida', -37, 43, 6, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (27, 'bodega', '25', 'JUGOS', 'Unidad', NULL, '2027-02-10', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (27, 'inicial', 95, 0, 95, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (27, 'salida', -95, 95, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (28, 'bodega', '26', 'BOLSAS DE LECHE', 'Unidad', NULL, '2027-10-17', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (28, 'inicial', 12, 0, 12, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (28, 'salida', -12, 12, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (29, 'bodega', '27', 'MILLOWS CORAZON', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (29, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (29, 'salida', -2, 2, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (30, 'bodega', '28', 'MINIBUM', 'Unidad', NULL, '2026-06-01', 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (30, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (30, 'salida', -2, 3, 1, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (31, 'bodega', '29', 'BBB BARRA CRUNCHY ROJO', 'Unidad', NULL, '2026-06-01', 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (31, 'inicial', 4, 0, 4, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (31, 'salida', -3, 4, 1, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (32, 'bodega', '30', 'FRUTICAS CARAMELO', 'Unidad', NULL, '2026-06-01', 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (32, 'inicial', 4, 0, 4, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (32, 'salida', -3, 4, 1, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (33, 'bodega', '31', 'MINIBUM SURTIDO TROPICAL', 'Unidad', NULL, '2026-06-01', 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (33, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (33, 'salida', -1, 3, 2, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (34, 'bodega', '32', 'TIPITIN CORAZON', 'Unidad', NULL, '2026-06-01', 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (34, 'inicial', 5, 0, 5, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (34, 'salida', -4, 5, 1, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (35, 'bodega', '33', 'TIPITIN LECHE', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (35, 'inicial', 4, 0, 4, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (35, 'salida', -4, 4, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (36, 'bodega', '34', 'FRUTICAS LOVE CANDY', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (36, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (36, 'salida', -3, 3, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (37, 'bodega', '35', 'MORDISQUETAS POSTRE DE MARACUY', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (37, 'inicial', 1, 0, 1, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (37, 'salida', -1, 1, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (38, 'bodega', '36', 'MORDISQUETAS RON CON PASAS', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (38, 'inicial', 1, 0, 1, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (38, 'salida', -1, 1, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (39, 'bodega', '37', 'MAX FRUTACIDAS', 'Unidad', NULL, '2026-06-01', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (39, 'inicial', 4, 0, 4, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (39, 'salida', -4, 4, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (40, 'bodega', '38', 'PIRULITO SURTIDO', 'Unidad', NULL, '2026-06-01', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (40, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (40, 'salida', -2, 2, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (41, 'bodega', '39', 'CHOCOBREAK TRADICIONAL', 'Unidad', NULL, '2026-06-01', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (41, 'inicial', 4, 0, 4, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (41, 'salida', -4, 4, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (42, 'bodega', '40', 'MENTA HELADA SURTIDA', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (42, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (42, 'salida', -3, 3, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (43, 'bodega', '41', 'CHOCOBREAK AND COOKIES', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (43, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (43, 'salida', -2, 2, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (44, 'bodega', '42', 'GRISSLY CAJA', 'Unidad', NULL, '2026-06-01', 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (44, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (44, 'salida', -1, 3, 2, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (45, 'bodega', '43', 'CHOCMELOS', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (45, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (45, 'salida', -3, 3, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (46, 'bodega', '44', 'TIPITIN UNICORNIO', 'Unidad', NULL, '2026-06-01', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (46, 'inicial', 4, 0, 4, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (46, 'salida', -4, 4, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (47, 'bodega', '45', 'MILLOWS UNICORNIO', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (47, 'inicial', 1, 0, 1, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (47, 'salida', -1, 1, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (48, 'bodega', '46', 'FRUTICAS CRUJI MASTICABLE', 'Unidad', NULL, '2026-06-01', 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (48, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (48, 'salida', -1, 3, 2, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (49, 'bodega', '47', 'CHOCOBREAK BALL', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (49, 'inicial', 1, 0, 1, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (49, 'salida', -1, 1, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (50, 'bodega', '48', 'MAX COCO CARAMELO BLANDO', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (50, 'inicial', 1, 0, 1, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (50, 'salida', -1, 1, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (51, 'bodega', '49', 'COFFEE DELIGHT BLANDO', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (51, 'inicial', 3, 0, 3, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (51, 'salida', -3, 3, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (52, 'bodega', '50', 'NUCITA MASTICABLE', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (52, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (52, 'salida', -2, 2, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (53, 'bodega', '51', 'MAX COMBI', 'Unidad', NULL, '2026-06-01', 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (53, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (53, 'salida', -2, 2, 0, 'Salidas registradas en el Excel', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (54, 'sst', NULL, 'Agua pequeña cristal', 'Unidad', NULL, '2026-09-18', 12, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (54, 'inicial', 12, 0, 12, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (55, 'sst', NULL, 'Agua pequeña mineral', 'Unidad', NULL, '2027-02-04', 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (55, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (56, 'aseo', NULL, 'VASO DE 9 ONZ X 40 UNID', 'CAJA X 25 PQ', NULL, NULL, 1560, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (56, 'inicial', 1560, 0, 1560, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (57, 'aseo', NULL, 'PLATO 23 X 20 UNID', 'CAJA X 20 PQ', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (57, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (58, 'aseo', NULL, 'TOALLAS DE PAPEL INTERFOLIADAS DOBLE HOJA ELITE 150 UNID', 'CAJA X 24 PQ', NULL, NULL, 48, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (58, 'inicial', 48, 0, 48, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (59, 'aseo', '7016', 'TOALLA MANOS ROLLO NAT X 100 MTS R-0840 / 0057 SCOTT', 'PACAS DE 6 CERRADA', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (59, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (60, 'aseo', '1.77024E+13', 'TOALLA MANOS ROLLO BCA REF 30240348 X 80 MTS KLEENEX', 'Unidad', NULL, NULL, 0, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (60, 'inicial', 0, 0, 0, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (61, 'aseo', NULL, 'CAJA GUANTES', 'Unidad', NULL, NULL, 200, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (61, 'inicial', 200, 0, 200, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (62, 'aseo', NULL, 'CAJA TAPABOCAS ADULTOS', 'Unidad', NULL, NULL, 2, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (62, 'inicial', 2, 0, 2, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
  INSERT INTO inventario_articulos (id, bodega, referencia, producto, unidad, minimo, vence, stock, "createdAt", "creadoPorNombre", "updatedAt") VALUES (63, 'aseo', NULL, 'CAJA TAPABOCAS NIÑOS', 'Unidad', NULL, NULL, 1, '2026-11-11', 'Importación Excel', '2026-11-11');
  INSERT INTO inventario_movimientos ("articuloId", tipo, cantidad, "stockAntes", "stockDespues", motivo, "createdAt", "creadoPorNombre") VALUES (63, 'inicial', 1, 0, 1, 'Cantidad inicial del Excel «BIENESTAR GENERAL 2026», pestaña Inventario Bodega', '2026-11-11', 'Importación Excel');
    PERFORM setval(pg_get_serial_sequence('inventario_articulos', 'id'), (SELECT MAX(id) FROM inventario_articulos));
  END IF;
END
$$;
