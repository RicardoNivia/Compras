// Carga la plantilla Excel de flujo de caja al módulo de Tesorería (BD LOCAL; producción solo si se pide expresamente).
// Usa el mismo núcleo que el botón «Importar plantilla Excel» de la app: lib/tesoreria/importadorExcel.js.
//
// Uso (desde backend/):
//   node scripts/tesoreria/importarFlujoCaja.mjs "<archivo.xlsx>"                 → solo muestra qué haría
//   node scripts/tesoreria/importarFlujoCaja.mjs "<archivo.xlsx>" --confirmar     → agrega lo nuevo y actualiza estados
//   ... --reemplazar               borra ANTES todo lo de Tesorería (movimientos, extractos, reglas, maestros, cierres)
//   ... --acceso=correo@empresa    da acceso de firma a esa persona (si aún no tiene)
//
// La hoja del libro se reconoce por sus encabezados (Item, INGRESO/EGRESO, ESTADO, Concepto, Medio de pago, Paga,
// Año, Mes, Valor; o Fecha en lugar de Año/Mes). Si la plantilla tiene otras columnas, usa la app: ahí Nova propone el
// mapeo. Cada fila lleva una huella, así que volver a cargar la misma plantilla (o una versión nueva) no duplica.

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { analizarLibro, resumenPlan, clavesExistentes, aplicarPlan } from "../../lib/tesoreria/importadorExcel.js";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const confirmar = args.includes("--confirmar");
const reemplazar = args.includes("--reemplazar");
const accesoEmail = (args.find((a) => a.startsWith("--acceso=")) || "").split("=")[1];
if (!archivo) {
  console.error('Uso: node scripts/tesoreria/importarFlujoCaja.mjs "<archivo.xlsx>" [--confirmar] [--reemplazar] [--acceso=correo]');
  process.exit(1);
}

const nombreArchivo = archivo.split(/[\\/]/).pop();
const plan = analizarLibro(readFileSync(archivo));
if (!plan.reconocido) {
  console.error(`No reconocí la hoja del libro${plan.faltan?.length ? ` (faltan columnas: ${plan.faltan.join(", ")})` : ""}. Súbela desde la app: Nova propone el mapeo de columnas.`);
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const r = resumenPlan(plan, reemplazar ? null : await clavesExistentes(prisma));
  console.log(`Libro: hoja «${r.libro.hoja}» (${r.libro.origen}), años ${r.anios.join(", ")}: ${r.filas} filas → ${r.movimientos} movimientos (${r.proyectados} proyectados), ${r.traslados} traslados, ${r.enCero} en cero omitidas.`);
  for (const [k, v] of Object.entries(r.maestros)) console.log(`  ${k}: ${v.total}${v.nuevos.length !== v.total ? ` (${v.nuevos.length} nuevos)` : ""}`);
  console.log(`Saldos iniciales: ${r.saldos.map((s) => `${s.cuenta} COP ${s.valor.toLocaleString("es-CO")} (${s.fecha})`).join(" · ") || "ninguno"}`);
  console.log(`Extractos: ${r.extractos.map((e) => `«${e.hoja}» (${e.formato}) → ${e.cuenta}: ${e.lineas} líneas, ${e.coincidencias} coinciden con el libro`).join(" · ") || "ninguno"}`);
  for (const a of r.avisos) console.log(`Aviso: ${a}`);

  if (!confirmar) {
    console.log("\nSimulación: no se escribió nada. Agrega --confirmar para cargarlo.");
  } else {
    const res = await aplicarPlan(prisma, plan, { modo: reemplazar ? "reemplazar" : "agregar", creador: { nombre: "Importación Excel" }, archivo: nombreArchivo });
    console.log(`Listo (${res.modo}): ${res.movimientosNuevos} movimientos nuevos, ${res.movimientosActualizados} pasaron a ejecutado, ${res.movimientosIguales} ya estaban; ${res.reglasNuevas} reglas nuevas.`);
    for (const e of res.extractos) console.log(`  ${e.cuenta}: ${e.lineasNuevas} líneas nuevas (${e.repetidas} ya estaban), ${e.enlazadas} enlazadas solas.`);
    if (accesoEmail) {
      const u = await prisma.user.findUnique({ where: { email: accesoEmail.toLowerCase() } });
      if (!u) console.log(`No existe el usuario ${accesoEmail}: no se dio acceso.`);
      else {
        await prisma.accesoTesoreria.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id, userNombre: u.nombre, nivel: "firma", creadoPorNombre: "Importación Excel" } });
        console.log(`Acceso de firma para ${u.nombre}.`);
      }
    }
    await prisma.auditLog.create({
      data: { action: "importar", entityType: "movimientoTesoreria", recordId: "importacion-excel", recordInfo: `Importación de «${nombreArchivo}» (${res.modo}): ${res.movimientosNuevos} nuevos, ${res.movimientosActualizados} actualizados`, userNombre: "Importación Excel" },
    });
  }
} finally {
  await prisma.$disconnect();
}
