-- "documentacionAlDia" quedaba redundante con el checklist de compras
-- (ProveedorChecklist), que ya cubre RUT vigente y los demás requisitos.
ALTER TABLE "proveedores" DROP COLUMN IF EXISTS "documentacionAlDia";
