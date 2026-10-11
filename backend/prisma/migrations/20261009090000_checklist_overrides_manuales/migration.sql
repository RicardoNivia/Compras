-- Permite forzar manualmente los 3 ítems "automáticos" del checklist
-- (criticidad/área/contacto) cuando el dato derivado todavía no aplica —
-- igual que en la página original, donde los 6 ítems son clicables.

ALTER TABLE "proveedor_checklists" ADD COLUMN "criticidadOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proveedor_checklists" ADD COLUMN "areaOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "proveedor_checklists" ADD COLUMN "contactoOverride" BOOLEAN NOT NULL DEFAULT false;
