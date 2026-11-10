// Exporta las valoraciones de Nova ya generadas a una MIGRACIÓN de Prisma, para que al desplegar
// (prisma migrate deploy) los registros radicados de producción reciban su valoración sin ejecutar la IA allá.
//
// Flujo:
//   1. Generar las valoraciones (con la API key) sobre la copia de los datos:
//        node scripts/valoraciones/valorarRegistrosRadicados.mjs --confirmar
//   2. Exportarlas a una migración:
//        node scripts/valoraciones/exportarValoracionesMigracion.mjs [nombre_migracion]
//      → crea prisma/migrations/<timestamp>_<nombre>/migration.sql (por defecto "carga_valoraciones_nova").
//   3. Commit + pipeline: la migración corre DESPUÉS de la que crea la tabla valoraciones_compra.
//
// La migración es idempotente y segura:
//   · Solo inserta para registros que existan en la base destino (los ids de producción coinciden con los de la copia).
//   · Si un registro ya tiene valoración (p. ej. la generó la app al radicar) NO se sobrescribe (ON CONFLICT DO NOTHING).
//   · Los registros radicados después de la exportación los valora el backend en segundo plano (lib/valoracionAuto.js).
//
// Variable de entorno: DATABASE_URL (la base desde la que se exportan).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? "NULL" : String(Number(v)));
const t = (d) => (d ? `'${new Date(d).toISOString().replace("T", " ").replace("Z", "")}'` : "NULL");

try {
  const filas = await prisma.valoracionCompra.findMany({ orderBy: { recordId: "asc" } });
  if (!filas.length) {
    console.error("No hay valoraciones para exportar. Genera primero con valorarRegistrosRadicados.mjs --confirmar.");
    process.exit(1);
  }
  const nombre = (process.argv[2] || "carga_valoraciones_nova").replace(/[^a-z0-9_]/gi, "_").toLowerCase();

  const valores = filas.map((v) => `  (${[
    q(v.recordId), n(v.puntajeCompra), n(v.puntajeProveedor), q(v.resumen), q(v.observacionCompra), q(v.observacionProveedor),
    q(v.factores), n(v.comprasPrevias), q(v.modelo), q(v.origen), t(v.createdAt), t(v.updatedAt), q(v.creadoPorNombre),
  ].join(", ")})`);

  const sql = `-- Carga de las valoraciones de Nova (compras radicadas) generadas previamente: ${filas.length} valoraciones.
-- Generada el ${new Date().toISOString().slice(0, 10)} por scripts/valoraciones/exportarValoracionesMigracion.mjs.
-- Permite que producción quede valorada sin ejecutar la IA allá. Idempotente: solo inserta para registros que existan
-- y nunca sobrescribe una valoración existente. Los radicados posteriores los valora el backend en segundo plano.

INSERT INTO "valoraciones_compra" (
  "recordId", "puntajeCompra", "puntajeProveedor", "resumen", "observacionCompra", "observacionProveedor",
  "factores", "comprasPrevias", "modelo", "origen", "createdAt", "updatedAt", "creadoPorNombre"
)
SELECT v."recordId", v."puntajeCompra"::int, v."puntajeProveedor"::int, v."resumen", v."observacionCompra", v."observacionProveedor",
  v."factores", v."comprasPrevias"::int, v."modelo", v."origen", v."createdAt"::timestamp, v."updatedAt"::timestamp, v."creadoPorNombre"
FROM (VALUES
${valores.join(",\n")}
) AS v("recordId", "puntajeCompra", "puntajeProveedor", "resumen", "observacionCompra", "observacionProveedor",
  "factores", "comprasPrevias", "modelo", "origen", "createdAt", "updatedAt", "creadoPorNombre")
WHERE EXISTS (SELECT 1 FROM "records" r WHERE r."id" = v."recordId")
ON CONFLICT ("recordId") DO NOTHING;

-- Constancia en Auditoría (una sola vez).
INSERT INTO "audit_logs" ("id", "action", "entityType", "recordId", "recordInfo", "userNombre", "createdAt")
SELECT 'mxv' || substr(md5('carga-valoraciones-nova|${nombre}'), 1, 22), 'crear', 'valoracion', 'carga-valoraciones-nova',
  'Carga de valoraciones de Nova generadas previamente (migración): ${filas.length} compra(s) valorada(s)',
  'Valoración masiva', NOW()
ON CONFLICT ("id") DO NOTHING;
`;

  const stamp = process.argv[3] || "20261014010000"; // después de 20261014000000_valoracion_ia_compras (crea la tabla)
  const dir = path.join(DIR, "../../prisma/migrations", `${stamp}_${nombre}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "migration.sql"), sql);
  const kb = Math.round(Buffer.byteLength(sql) / 1024);
  console.log(`Migración generada: prisma/migrations/${stamp}_${nombre}/migration.sql (${filas.length} valoraciones, ${kb} KB)`);
} finally {
  await prisma.$disconnect();
}
