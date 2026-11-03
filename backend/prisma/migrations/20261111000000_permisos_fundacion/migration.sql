-- Fundación tiene sus propios permisos: cada rol arranca con lo mismo que ya tenía en Bienestar.
INSERT INTO "role_permissions" ("id", "role", "feature", "allowed", "updatedAt")
SELECT 'rpf' || substr(md5(p."role" || '|' || m.nueva), 1, 22), p."role", m.nueva, p."allowed", CURRENT_TIMESTAMP
FROM "role_permissions" p
JOIN (VALUES ('viewBienestar', 'viewFundacion'), ('editBienestar', 'editFundacion'), ('viewDashboardBienestar', 'viewDashboardFundacion')) AS m(base, nueva) ON p."feature" = m.base
ON CONFLICT ("role", "feature") DO NOTHING;
