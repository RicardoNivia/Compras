// Limpia y vuelve a armar los datos de Bienestar en la BD LOCAL desde la carpeta de archivos del equipo. Solo corre
// contra localhost. Después: correr el agente de evaluación y scripts/bienestar/generarMigracionCarga.mjs.
//
// Uso (desde backend/):
//   node scripts/bienestar/reconstruirLocal.mjs <carpeta>               → solo dice qué haría
//   node scripts/bienestar/reconstruirLocal.mjs <carpeta> --confirmar   → lo hace
//
// Las actividades de 2026 no se borran (conservan su id y sus compras reales): se limpia lo que cuelga de ellas y lo
// que se digitó en pruebas. Las fotos se conservan: salieron de los informes en PDF de la carpeta.

import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const [carpeta] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const confirmar = process.argv.includes("--confirmar");
if (!carpeta) {
  console.error("Uso: node scripts/bienestar/reconstruirLocal.mjs <carpeta> [--confirmar]");
  process.exit(1);
}
if (!/@localhost:5432\//.test(process.env.DATABASE_URL || "")) {
  console.error("Este script solo corre contra la base de datos local.");
  process.exit(1);
}

const CREADOR = "Migración histórica";
const HOY = new Date().toISOString().slice(0, 10);

// Actividades de 2025 según BASE INFORME BIENESTAR 2025 (enero a mayo) y la hoja BASE 2025 de Fundación. Los cumpleaños,
// snacks semanales y refrigerios de esos archivos no son actividades del cronograma.
const ACTIVIDADES_2025 = [
  { nombre: "Feria del libro", fecha: "2025-02-20", linea: "Bienestar", informe: 55 },
  { nombre: "Miércoles de ceniza", fecha: "2025-03-05", linea: "Bienestar", informe: 23 },
  { nombre: "Día de la mujer", fecha: "2025-03-07", linea: "Bienestar", informe: 25 },
  { nombre: "Feria de servicios Compensar", fecha: "2025-03-13", linea: "Bienestar", informe: 50 },
  { nombre: "Día del hombre", fecha: "2025-03-19", linea: "Bienestar", informe: 60 },
  { nombre: "Día del libro", fecha: "2025-04-23", linea: "Bienestar", informe: 35 },
  { nombre: "Día del niño", fecha: "2025-04-25", linea: "Bienestar", informe: 80 },
  { nombre: "Día del trabajo", fecha: "2025-05-01", linea: "Bienestar", informe: 238 },
  { nombre: "Día de la madre", fecha: "2025-05-09", linea: "Bienestar", informe: 44 },
  { nombre: "Torneo de bolos", fecha: "2025-05-26", fechaFin: "2025-05-29", linea: "Bienestar", informe: 100 },
  { nombre: "Carrera de la mujer", fecha: "2025-09-07", linea: "Bienestar", informe: 42 },
  { nombre: "Taller de pintura “Conectando corazones”", fecha: "2025-03-06", linea: "Fundación", informe: 33 },
  { nombre: "Almorcemos con los abuelitos", fecha: "2025-04-10", linea: "Fundación", informe: 21 },
  { nombre: "Feria del pueblo", fecha: "2025-06-07", linea: "Fundación" },
  { nombre: "Desarrollando habilidades", fecha: "2025-07-24", linea: "Fundación" },
  { nombre: "Evento Conectando Corazones", fecha: "2025-09-26", linea: "Fundación" },
  { nombre: "Halloween niños", fecha: "2025-10-30", linea: "Fundación" },
  { nombre: "Ayudar es fácil", fecha: "2025-11-13", linea: "Fundación" },
];

const NOTA_INTEGRACION = "Cotizaciones de pasadía en Hotel Lagosol (Compensar) del 19 de febrero de 2026 para 13, 14 y 27 de febrero, sin confirmar ni lista de participantes.";

const prisma = new PrismaClient();
try {
  const pruebas = await prisma.actividadBienestar.findMany({ where: { nombre: { startsWith: "PRUEBA" } }, select: { id: true, nombre: true } });
  const comprasDemo = await prisma.record.findMany({ where: { actividadId: { not: null }, descripcion: { contains: "(dato" } }, select: { id: true, localSeq: true } });
  console.log(`Actividades de prueba a borrar: ${pruebas.map((a) => a.nombre).join(", ") || "ninguna"}`);
  console.log(`Compras demo a desasociar: ${comprasDemo.map((c) => `#${c.localSeq}`).join(", ") || "ninguna"}`);
  if (!confirmar) {
    console.log("Agrega --confirmar para hacerlo.");
    process.exit(0);
  }

  await prisma.record.updateMany({ where: { id: { in: comprasDemo.map((c) => c.id) } }, data: { actividadId: null, actividad: null } });
  await prisma.solicitudCompra.deleteMany({});
  await prisma.analisisActividad.deleteMany({});
  await prisma.analisisBienestar.deleteMany({});
  await prisma.observacionActividad.deleteMany({});
  await prisma.inventarioActividad.deleteMany({});
  await prisma.participanteActividad.deleteMany({});
  await prisma.actividadBienestar.deleteMany({ where: { id: { in: pruebas.map((a) => a.id) } } });
  await prisma.actividadBienestar.updateMany({ where: { estado: "cerrada" }, data: { estado: "ejecutada" } });
  await prisma.actividadBienestar.updateMany({
    data: {
      presupuesto: null, responsableUserId: null, responsableNombre: null, calificacion: null, comentarioCierre: null,
      cerradaAt: null, cerradaPorNombre: null, cerradaPorUserId: null, formularioAbierto: false, formularioToken: null,
      formularioCampos: null, aplicaParticipantes: true,
    },
  });
  // BASE ACTIVIDADES: "23 y 24 de junio de 2026".
  await prisma.actividadBienestar.updateMany({ where: { nombre: "Torneo de bolos", fecha: "2026-06-23" }, data: { fechaFin: "2026-06-24" } });
  await prisma.actividadBienestar.updateMany({ where: { nombre: { startsWith: "Programar integración" } }, data: { observaciones: NOTA_INTEGRACION } });

  for (const a of ACTIVIDADES_2025) {
    const ya = await prisma.actividadBienestar.findFirst({ where: { nombre: a.nombre, fecha: a.fecha } });
    if (ya) continue;
    await prisma.actividadBienestar.create({
      data: {
        nombre: a.nombre, fecha: a.fecha, fechaFin: a.fechaFin || null, linea: a.linea, estado: "ejecutada", asistentes: a.informe ?? null,
        observaciones: a.informe ? `Participantes según el informe de Bienestar 2025: ${a.informe}.` : null, creadoPorNombre: CREADOR,
      },
    });
  }

  for (const [script, ...args] of [["importarParticipantes.mjs", carpeta, "--confirmar"], ["sincronizarCatalogos.mjs", "--confirmar"]]) {
    const r = spawnSync(process.execPath, ["--no-warnings", `scripts/bienestar/${script}`, ...args], { stdio: "inherit", env: process.env });
    if (r.status !== 0) throw new Error(`Falló ${script}`);
  }

  // Tienen lista con asistencia: ya se realizaron aunque la base las tuviera como programadas.
  for (const a of await prisma.actividadBienestar.findMany({ where: { estado: "programada", participantes: { some: { asistio: true } } }, select: { id: true, nombre: true, fecha: true } })) {
    if (a.fecha >= HOY) continue;
    await prisma.actividadBienestar.update({ where: { id: a.id }, data: { estado: "ejecutada" } });
    console.log(`Pasa a ejecutada, tiene asistencia: ${a.nombre}`);
  }

  // Ya pasaron y no hay lista de nadie: no manejan participantes. Las futuras y sin fecha todavía pueden tenerla.
  const sinLista = await prisma.actividadBienestar.findMany({
    where: { participantes: { none: {} }, OR: [{ fecha: { lt: HOY } }, { estado: "ejecutada" }] },
    select: { id: true, nombre: true, fecha: true },
  });
  await prisma.actividadBienestar.updateMany({ where: { id: { in: sinLista.map((a) => a.id) } }, data: { aplicaParticipantes: false } });
  await prisma.auditLog.createMany({
    data: sinLista.map((a) => ({
      action: "editar", entityType: "actividad", recordId: String(a.id), recordInfo: a.nombre, userNombre: CREADOR,
      changes: JSON.stringify([{ field: "aplicaParticipantes", label: "Aplica participantes y listas de asistencia", before: true, after: false }]),
    })),
  });
  console.log(`Sin lista en la carpeta, quedan sin participantes (${sinLista.length}): ${sinLista.map((a) => `${a.nombre} ${a.fecha}`).join(" · ")}`);
} finally {
  await prisma.$disconnect();
}
