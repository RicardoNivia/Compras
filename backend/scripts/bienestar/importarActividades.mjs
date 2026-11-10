// Carga las actividades del cronograma de Bienestar desde un JSON (export de la base de informe de Bienestar:
// filas { actividad, fecha, linea, en_cronograma, estado, inscritos, participantes, nota }).
//
// Uso (desde backend/):
//   node scripts/bienestar/importarActividades.mjs <archivo.json>               → solo muestra qué haría
//   node scripts/bienestar/importarActividades.mjs <archivo.json> --confirmar   → las crea
//
// Idempotente: una actividad con el mismo nombre y fecha ya existente se omite. El archivo se lee como UTF-8.
// Estados de la base → estados del módulo (creada / programada / ejecutada / cerrada):
//   Ejecutada → ejecutada · Programada, Reprogramada, Sin reporte → programada · Sin fecha → creada.
// El estado original se deja en observaciones cuando no coincide (p. ej. "Sin reporte").

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const [archivo] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const confirmar = process.argv.includes("--confirmar");
if (!archivo) {
  console.error("Uso: node scripts/bienestar/importarActividades.mjs <archivo.json> [--confirmar]");
  process.exit(1);
}

const crudo = JSON.parse(readFileSync(archivo, "utf8"));
const filas = Array.isArray(crudo) ? crudo : crudo.rows || crudo.data || crudo.results || [];

const ESTADO = { Ejecutada: "ejecutada", Programada: "programada", Reprogramada: "programada", "Sin reporte": "programada", "Sin fecha": "creada" };
const entero = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

const actividades = filas
  .filter((f) => String(f.actividad || "").trim())
  .map((f) => {
    const fecha = f.fecha ? String(f.fecha).slice(0, 10) : null;
    const estado = fecha ? ESTADO[f.estado] || "programada" : "creada";
    const notas = [ESTADO[f.estado] && f.estado !== "Ejecutada" && f.estado !== "Programada" && f.estado !== "Sin fecha" ? `Estado en la base de Bienestar: ${f.estado}.` : null, f.nota || null].filter(Boolean);
    return {
      nombre: String(f.actividad).trim().slice(0, 200),
      fecha,
      linea: f.linea === "Fundación" ? "Fundación" : "Bienestar",
      estado,
      inscritos: entero(f.inscritos),
      asistentes: entero(f.participantes),
      enCronograma: f.en_cronograma !== "No",
      observaciones: notas.length ? notas.join(" ") : null,
      creadoPorNombre: "Importación Excel",
    };
  });

const prisma = new PrismaClient();
try {
  const existentes = await prisma.actividadBienestar.findMany({ select: { nombre: true, fecha: true } });
  const ya = new Set(existentes.map((e) => `${e.nombre}|${e.fecha ?? ""}`));
  const nuevas = actividades.filter((a) => !ya.has(`${a.nombre}|${a.fecha ?? ""}`));
  const porEstado = nuevas.reduce((m, a) => ({ ...m, [a.estado]: (m[a.estado] || 0) + 1 }), {});
  console.log(`${filas.length} filas · ${nuevas.length} actividades nuevas · ${actividades.length - nuevas.length} ya existían`);
  console.log("Por estado:", porEstado);
  if (!confirmar) {
    console.log("Simulación: no se escribió nada. Agrega --confirmar para crearlas.");
  } else if (nuevas.length) {
    await prisma.actividadBienestar.createMany({ data: nuevas });
    await prisma.auditLog.create({
      data: {
        action: "crear",
        entityType: "actividad",
        recordId: "importacion-actividades",
        recordInfo: `Importación de ${nuevas.length} actividades de Bienestar desde ${archivo.split(/[\/]/).pop()}`,
        userNombre: "Importación Excel",
      },
    });
    console.log(`Listo: ${nuevas.length} actividades creadas.`);
  }
} finally {
  await prisma.$disconnect();
}
