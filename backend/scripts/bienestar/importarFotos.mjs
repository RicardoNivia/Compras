// Material fotográfico de las actividades de Bienestar sacado de los informes mensuales (PDF).
//
// Uso (desde backend/):
//   node scripts/bienestar/importarFotos.mjs --exportar <actividades.json>        → lista { id, nombre, fecha } para el extractor
//   python -E -P scripts/bienestar/extraerFotosInformes.py <carpeta_pdf> <actividades.json> <salida>
//   node scripts/bienestar/importarFotos.mjs <salida/manifiesto.json>             → solo muestra qué haría
//   node scripts/bienestar/importarFotos.mjs <salida/manifiesto.json> --confirmar → las carga
//
// Idempotente: una foto que ya está en la actividad (mismo hash SHA-1) se omite. Quedan con origen "informe", la página
// del PDF como fuente y "Migración informes" como creador. La asignación foto → actividad es automática (ver el
// extractor): si alguna quedó en la actividad equivocada se quita desde la pestaña Fotos de la actividad.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const confirmar = process.argv.includes("--confirmar");
const exportar = process.argv.includes("--exportar");
const CREADOR = "Migración informes";
const MAX_POR_ACTIVIDAD = 200;

if (!args[0]) {
  console.error("Uso: node scripts/bienestar/importarFotos.mjs [--exportar] <archivo.json> [--confirmar]");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  if (exportar) {
    const acts = await prisma.actividadBienestar.findMany({ where: { fecha: { not: null } }, select: { id: true, nombre: true, fecha: true }, orderBy: { fecha: "asc" } });
    writeFileSync(args[0], JSON.stringify(acts, null, 1), "utf8");
    console.log(`${acts.length} actividades con fecha exportadas a ${args[0]}`);
  } else {
    const manifiesto = JSON.parse(readFileSync(args[0], "utf8"));
    const ids = [...new Set(manifiesto.map((f) => f.actividadId))];
    const actividades = new Map((await prisma.actividadBienestar.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((a) => [a.id, a]));
    const yaHay = await prisma.fotoActividad.findMany({ where: { actividadId: { in: ids } }, select: { actividadId: true, hash: true } });
    const vistos = new Set(yaHay.map((f) => `${f.actividadId}|${f.hash}`));
    const conteo = new Map(ids.map((id) => [id, yaHay.filter((f) => f.actividadId === id).length]));

    const nuevas = [];
    let omitidas = 0;
    for (const f of manifiesto) {
      if (!actividades.has(f.actividadId)) { console.warn(`  ! actividad ${f.actividadId} no existe, se omite ${f.archivo}`); omitidas++; continue; }
      const datos = readFileSync(f.archivo);
      const hash = createHash("sha1").update(datos).digest("hex");
      if (vistos.has(`${f.actividadId}|${hash}`) || conteo.get(f.actividadId) >= MAX_POR_ACTIVIDAD) { omitidas++; continue; }
      vistos.add(`${f.actividadId}|${hash}`);
      conteo.set(f.actividadId, conteo.get(f.actividadId) + 1);
      const n = nuevas.filter((x) => x.actividadId === f.actividadId).length + 1;
      nuevas.push({
        actividadId: f.actividadId,
        nombre: `informe-${f.actividadId}-${n}.jpg`,
        mime: "image/jpeg",
        ancho: f.ancho,
        alto: f.alto,
        bytes: datos.length,
        datos,
        miniatura: readFileSync(f.miniatura),
        hash,
        origen: "informe",
        fuente: f.fuente,
        creadoPorNombre: CREADOR,
      });
    }
    const porActividad = nuevas.reduce((m, f) => m.set(f.actividadId, (m.get(f.actividadId) || 0) + 1), new Map());
    console.log(`${manifiesto.length} fotos en el manifiesto · ${nuevas.length} nuevas · ${omitidas} omitidas (ya estaban o sin actividad)`);
    for (const [id, n] of porActividad) console.log(`  · ${actividades.get(id).nombre}: ${n}`);
    if (!confirmar) {
      console.log("Simulación: no se escribió nada. Agrega --confirmar para cargarlas.");
    } else if (nuevas.length) {
      await prisma.$transaction(async (tx) => {
        for (const f of nuevas) await tx.fotoActividad.create({ data: f, select: { id: true } });
        for (const [id, n] of porActividad) {
          await tx.auditLog.create({
            data: {
              action: "importar",
              entityType: "fotoActividad",
              recordId: String(id),
              recordInfo: `${actividades.get(id).nombre}: ${n} foto(s) migradas de los informes mensuales de Bienestar`,
              userNombre: CREADOR,
            },
          });
        }
      });
      console.log(`Listo: ${nuevas.length} fotos cargadas.`);
    }
  }
} finally {
  await prisma.$disconnect();
}
