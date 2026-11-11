-- Permisos del inventario (bodega) de Bienestar en la Matriz: viewInventarioBienestar, editInventarioBienestar,
-- usarInventarioBienestar y entradaInventarioCompra. Los roles del sistema toman sus valores por defecto (lib/permissions.js);
-- los roles creados en la app (tabla "roles") no tienen valores por defecto, así que conservan el acceso que ya tenían:
--   ver la bodega        <- viewBienestar o viewFundacion
--   gestionar / usar     <- editBienestar o editFundacion
--   entrada por compra   <- createRecord o editRecord
INSERT INTO "role_permissions" ("id", "role", "feature", "allowed", "updatedAt")
SELECT 'pinv' || md5(r."clave" || n."feature" || clock_timestamp()::text), r."clave", n."feature", true, now()
FROM "roles" r
JOIN (VALUES
  ('viewInventarioBienestar', ARRAY['viewBienestar', 'viewFundacion']),
  ('editInventarioBienestar', ARRAY['editBienestar', 'editFundacion']),
  ('usarInventarioBienestar', ARRAY['editBienestar', 'editFundacion']),
  ('entradaInventarioCompra', ARRAY['createRecord', 'editRecord'])
) AS n("feature", "origen") ON true
WHERE EXISTS (
  SELECT 1 FROM "role_permissions" p WHERE p."role" = r."clave" AND p."feature" = ANY (n."origen") AND p."allowed" = true
)
ON CONFLICT ("role", "feature") DO NOTHING;
