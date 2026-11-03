// Escribe la migración que lleva a otra base los datos de Bienestar armados en la BD LOCAL (ver reconstruirLocal.mjs):
// actividades, participantes, fotos, análisis de Nova, catálogos y la asociación de las compras.
//
// Uso (desde backend/): node scripts/bienestar/generarMigracionCarga.mjs <nombre_de_la_migracion>
//
// Los datos sensibles NO se escriben porque el archivo queda en el repositorio: salud, contactos, menores, edades,
// correos y datos laborales de los Excel. Para tenerlos en otro ambiente, correr allá importarParticipantes.mjs.
// La migración solo carga si la tabla de actividades está vacía: nunca borra ni pisa lo que ya exista en la base.

import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const [nombre] = process.argv.slice(2);
if (!nombre) {
  console.error("Uso: node scripts/bienestar/generarMigracionCarga.mjs <nombre_de_la_migracion>");
  process.exit(1);
}
if (!/@localhost:5432\//.test(process.env.DATABASE_URL || "")) {
  console.error("Este script solo lee de la base de datos local.");
  process.exit(1);
}

const SENSIBLE = /sangre|eps|salud|antecedente|lesion|emergencia|pariente|nacimiento|hijo|alergi|condici|direcci|tel[eé]fono|celular|correo|e-?mail|edad|acompa|contrato|ingreso|idempleado|tratamiento/i;
const TIPOS_CATALOGO = ["areaParticipante", "motivoInasistencia", "unidadInventario", "escalaCalificacion"];
const TAG = "$bien_datos$";

const prisma = new PrismaClient();
const filas = async (sql) => JSON.parse((await prisma.$queryRawUnsafe(`SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)::text AS j FROM (${sql}) t`))[0].j);
const literal = (datos) => {
  const s = JSON.stringify(datos);
  if (s.includes(TAG)) throw new Error("Los datos contienen el delimitador de la migración.");
  return `${TAG}${s}${TAG}::jsonb`;
};
const cargar = (tabla, datos) => `  INSERT INTO "${tabla}" SELECT * FROM jsonb_populate_recordset(NULL::"${tabla}", ${literal(datos)});\n`;
const secuencia = (tabla) => `  PERFORM setval(pg_get_serial_sequence('"${tabla}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM "${tabla}"), 1));\n`;

try {
  const [maestros, actividades, participantes, fotos, analisisActividad, analisisBienestar, compras] = await Promise.all([
    filas(`SELECT * FROM maestros WHERE tipo IN (${TIPOS_CATALOGO.map((t) => `'${t}'`).join(",")})`),
    filas(`SELECT * FROM actividades_bienestar ORDER BY id`),
    filas(`SELECT * FROM participantes_actividad ORDER BY id`),
    filas(`SELECT * FROM fotos_actividad ORDER BY id`),
    filas(`SELECT * FROM analisis_actividad ORDER BY id`),
    filas(`SELECT * FROM analisis_bienestar ORDER BY id`),
    filas(`SELECT id, "actividadId", actividad FROM records WHERE "actividadId" IS NOT NULL`),
  ]);
  const sinSensibles = participantes.map((p) => {
    const datos = p.datos ? JSON.parse(p.datos) : {};
    const quedan = Object.fromEntries(Object.entries(datos).filter(([k]) => !SENSIBLE.test(k)));
    return { ...p, correo: null, datos: Object.keys(quedan).length ? JSON.stringify(quedan) : null };
  });

  const sql = `-- Carga de los datos de Bienestar y Fundación 2025-2026 (generada por scripts/bienestar/generarMigracionCarga.mjs).
-- Solo carga si no hay actividades: nunca borra ni pisa lo que ya exista. Sin datos sensibles de los Excel.
DO $carga_bienestar$
BEGIN
  IF EXISTS (SELECT 1 FROM "actividades_bienestar") THEN
    RAISE NOTICE 'Ya hay actividades de Bienestar: no se carga nada.';
    RETURN;
  END IF;

  -- Sin actividades, los análisis de dashboard que ya se hubieran generado están vacíos: se reemplazan.
  DELETE FROM "analisis_bienestar";

  INSERT INTO "maestros" SELECT * FROM jsonb_populate_recordset(NULL::"maestros", ${literal(maestros)}) ON CONFLICT DO NOTHING;
${cargar("actividades_bienestar", actividades)}${cargar("participantes_actividad", sinSensibles)}${cargar("fotos_actividad", fotos)}${cargar("analisis_actividad", analisisActividad)}${cargar("analisis_bienestar", analisisBienestar)}
  -- Los catálogos pueden tener otro id en esta base: se resuelven por su valor.
  UPDATE "participantes_actividad" p SET "areaId" = m.id FROM "maestros" m WHERE m.tipo = 'areaParticipante' AND m.valor = p.area;
  UPDATE "participantes_actividad" p SET "motivoInasistenciaId" = m.id FROM "maestros" m WHERE m.tipo = 'motivoInasistencia' AND m.valor = p."motivoInasistencia";

  -- Las compras que no existan en esta base simplemente no se asocian.
  UPDATE "records" r SET "actividadId" = x."actividadId", "actividad" = x.actividad
  FROM jsonb_to_recordset(${literal(compras)}) AS x(id text, "actividadId" int, actividad text)
  WHERE r.id = x.id;

${secuencia("actividades_bienestar")}${secuencia("participantes_actividad")}${secuencia("fotos_actividad")}${secuencia("analisis_actividad")}${secuencia("analisis_bienestar")}
  INSERT INTO "audit_logs" (id, action, "entityType", "recordId", "recordInfo", "userNombre")
  VALUES ('carga-bienestar-2025-2026', 'importar', 'actividad', 'carga-bienestar-2025-2026', 'Carga de Bienestar y Fundación 2025-2026: ${actividades.length} actividades, ${sinSensibles.length} participantes, ${fotos.length} fotos y ${analisisActividad.length} análisis de Nova', 'Migración histórica');
END
$carga_bienestar$;
`;
  const dir = `prisma/migrations/${nombre}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/migration.sql`, sql, "utf8");
  console.log(`${dir}/migration.sql: ${(Buffer.byteLength(sql) / 1048576).toFixed(1)} MB · ${actividades.length} actividades · ${sinSensibles.length} participantes · ${fotos.length} fotos · ${analisisActividad.length} + ${analisisBienestar.length} análisis · ${compras.length} compras · ${maestros.length} catálogos`);
} finally {
  await prisma.$disconnect();
}
