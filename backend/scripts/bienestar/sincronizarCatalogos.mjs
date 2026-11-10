// Lleva los participantes e inventario de Bienestar a sus maestros: unifica las áreas escritas de varias formas
// (BITAKORA / BITÁKORA, M&E / MYE…), las crea en el maestro "areaParticipante" y deja el id de área, motivo y unidad en
// cada fila. Correrlo después de migrar datos con importarParticipantes.mjs, que escribe el texto tal cual viene.
//
// Uso (desde backend/):
//   node scripts/bienestar/sincronizarCatalogos.mjs              → solo muestra qué haría
//   node scripts/bienestar/sincronizarCatalogos.mjs --confirmar  → lo aplica
// Idempotente. Las áreas que no son claramente la misma se dejan separadas (PROYECTOS, por ejemplo).

import { PrismaClient } from "@prisma/client";

const confirmar = process.argv.includes("--confirmar");
const CREADOR = "Migración histórica";
const claveDe = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/&/g, "Y").replace(/[^A-Z0-9Ñ]/g, "");

// Errores de digitación y formas de escribir la misma área que la comparación sin signos no alcanza a unir.
const ALIAS = {
  "GENTESOFT Y SST": "GENTESOFT - SST",
  "PROYECTOS & SERVICIO": "PROYECTOS Y SERVICIOS",
  "JURÍCO": "JURÍDICO",
  FINANCIERA: "FINANCIERO",
  "MERCADEO & CONMUNIACIONES": "MERCADEO Y COMUNICACIONES",
  "SISTEMA DE GESTION": "SISTEMAS DE GESTIÓN",
};
// Un número de documento digitado en la columna de área no es un área.
const noEsArea = (a) => /^[\d.,\s]+$/.test(a);

const prisma = new PrismaClient();
try {
  const filas = await prisma.participanteActividad.groupBy({ by: ["area"], _count: true, where: { area: { not: null } } });
  const grupos = new Map();
  for (const f of filas) {
    if (noEsArea(f.area)) continue;
    const destino = ALIAS[f.area] || f.area;
    const k = claveDe(destino);
    const g = grupos.get(k) || new Map();
    g.set(destino, (g.get(destino) || 0) + f._count);
    grupos.set(k, g);
  }
  // Nombre de cada grupo: el que ya está en el maestro; si no, el que tiene tildes y, entre iguales, el más usado.
  const maestros = await prisma.maestro.findMany({ where: { tipo: "areaParticipante" } });
  const canonico = new Map(maestros.map((m) => [claveDe(m.valor), m.valor]));
  const tieneTilde = (s) => /[^\x00-\x7F]/.test(s);
  for (const [k, g] of grupos) {
    if (canonico.has(k)) continue;
    const orden = [...g].sort((a, b) => Number(tieneTilde(b[0])) - Number(tieneTilde(a[0])) || b[1] - a[1]);
    canonico.set(k, orden[0][0]);
  }
  const nuevas = [...canonico].filter(([k]) => !maestros.some((m) => claveDe(m.valor) === k)).map(([, v]) => v);
  console.log(`${filas.length} formas de escribir el área → ${canonico.size} áreas (${nuevas.length} nuevas en el maestro)`);
  console.log([...canonico.values()].sort().join(" · "));
  if (!confirmar) {
    console.log("Simulación: no se escribió nada. Agrega --confirmar para aplicarlo.");
  } else {
    if (nuevas.length) await prisma.maestro.createMany({ data: nuevas.map((valor) => ({ tipo: "areaParticipante", valor, creadoPorNombre: CREADOR })), skipDuplicates: true });
    const catalogo = await prisma.maestro.findMany({ where: { tipo: { in: ["areaParticipante", "motivoInasistencia", "unidadInventario"] } } });
    const idArea = new Map(catalogo.filter((m) => m.tipo === "areaParticipante").map((m) => [claveDe(m.valor), m]));
    let areas = 0;
    for (const f of filas) {
      if (noEsArea(f.area)) {
        areas += (await prisma.participanteActividad.updateMany({ where: { area: f.area }, data: { area: null, areaId: null } })).count;
        continue;
      }
      const m = idArea.get(claveDe(ALIAS[f.area] || f.area));
      areas += (await prisma.participanteActividad.updateMany({ where: { area: f.area, OR: [{ areaId: { not: m.id } }, { areaId: null }, { NOT: { area: m.valor } }] }, data: { area: m.valor, areaId: m.id } })).count;
    }
    let motivos = 0;
    for (const m of catalogo.filter((x) => x.tipo === "motivoInasistencia")) {
      motivos += (await prisma.participanteActividad.updateMany({ where: { motivoInasistencia: m.valor, motivoInasistenciaId: null }, data: { motivoInasistenciaId: m.id } })).count;
    }
    let unidades = 0;
    for (const m of catalogo.filter((x) => x.tipo === "unidadInventario")) {
      unidades += (await prisma.inventarioActividad.updateMany({ where: { unidad: { equals: m.valor, mode: "insensitive" }, unidadId: null }, data: { unidad: m.valor, unidadId: m.id } })).count;
    }
    await prisma.auditLog.create({
      data: { action: "importar", entityType: "maestro", recordId: "catalogos-bienestar", recordInfo: `Maestros de Bienestar: ${nuevas.length} áreas nuevas, ${areas} participantes con área, ${motivos} con motivo, ${unidades} ítems con unidad`, userNombre: CREADOR },
    });
    console.log(`Listo: ${areas} participantes con área, ${motivos} con motivo, ${unidades} ítems con unidad.`);
  }
} finally {
  await prisma.$disconnect();
}
