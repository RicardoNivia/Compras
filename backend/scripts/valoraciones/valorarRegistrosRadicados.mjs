// Valoración con IA de los registros de compra YA radicados (carga masiva manual).
//
// OJO: no hace falta correrlo a mano al publicar. El backend ya valora en segundo plano, al arrancar,
// todas las compras radicadas que no tengan valoración (lib/valoracionAuto.js). Este script sirve para
// probar, para forzar una pasada o para reintentar (--reintentar) con otra base de datos.
//
// Uso (desde backend/):
//   node scripts/valoraciones/valorarRegistrosRadicados.mjs                 → solo cuenta (no llama a la IA ni escribe)
//   node scripts/valoraciones/valorarRegistrosRadicados.mjs --confirmar     → valora los radicados que aún no tienen valoración
//   Opciones: --limite N · --reintentar (también los ya valorados) · --concurrencia N (por defecto 3) · --registro <id>
//
// Variables de entorno: DATABASE_URL y ANTHROPIC_API_KEY (la clave NO se guarda en ningún archivo).

import { PrismaClient } from "@prisma/client";
import { valorarPendientes } from "../../lib/valoracionIA.js";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const valor = (n, def) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : def;
};
const confirmar = flag("confirmar");
const prisma = new PrismaClient();

try {
  const opciones = {
    reintentar: flag("reintentar"),
    limite: Number(valor("limite", 0)) || 0,
    concurrencia: Math.max(1, Math.min(8, Number(valor("concurrencia", 3)) || 3)),
    soloRegistro: valor("registro", null),
    log: (m) => console.log(`  ${m}`),
  };
  const totalRadicados = await prisma.record.count({ where: { radicado: true } });
  const yaValorados = await prisma.valoracionCompra.count();
  const previo = await valorarPendientes(prisma, { ...opciones, soloContar: true });
  console.log(`Radicados: ${totalRadicados} · con valoración: ${yaValorados} · a valorar ahora: ${previo.pendientes}${opciones.reintentar ? " (incluye reintentos)" : ""}`);

  if (!confirmar) {
    console.log("(simulación: no se llamó a la IA ni se escribió nada. Agrega --confirmar para valorar.)");
  } else if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY en el entorno.");
    process.exitCode = 1;
  } else {
    const r = await valorarPendientes(prisma, opciones);
    console.log(`\nValoradas: ${r.hechos} · con error: ${r.errores.length}`);
    if (r.hechos) {
      console.log(`Puntaje promedio de la compra: ${(r.sumaCompra / r.hechos).toFixed(2)} · del proveedor: ${r.nProveedor ? (r.sumaProveedor / r.nProveedor).toFixed(2) : "n/a"}`);
      console.log("Distribución puntaje de la compra:", r.distribucion);
    }
    if (r.errores.length) {
      console.log("Vuelve a correr el script para reintentar solo los que fallaron (los ya valorados se omiten).");
      process.exitCode = 2;
    }
  }
} finally {
  await prisma.$disconnect();
}
