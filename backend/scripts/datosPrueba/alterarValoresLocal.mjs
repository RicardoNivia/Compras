// SOLO BD LOCAL: altera los valores de las compras y de los presupuestos para que los datos de prueba no se parezcan
// a los de producción. Uso, desde backend/:
//   node scripts/datosPrueba/alterarValoresLocal.mjs <carpeta-del-respaldo>
//
// - Se niega a correr si DATABASE_URL no apunta a localhost / 127.0.0.1.
// - Antes de cambiar nada saca un respaldo (pg_dump, solo datos) de records, presupuestos y presupuesto_categorias.
//   Para volver atrás: vaciar esas tablas y cargar el .sql con psql.
// - Compras: un factor aleatorio por compra (0,55 a 1,75) aplicado igual a valor con IVA, sin IVA, cotizado y USD,
//   así se mantienen las proporciones (el IVA sigue cuadrando); se redondea a miles. La TRM no cambia.
// - Presupuestos: un factor aleatorio por área o categoría (0,6 a 1,6), redondeado a cientos de miles.
// - Deja una entrada en la auditoría con lo que se hizo.

import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
  console.error(`Abortado: DATABASE_URL apunta a "${url.hostname}", no a la BD local. Este script solo corre en local.`);
  process.exit(1);
}
const carpeta = process.argv[2];
if (!carpeta) {
  console.error("Indica la carpeta donde guardar el respaldo: node scripts/datosPrueba/alterarValoresLocal.mjs <carpeta>");
  process.exit(1);
}
mkdirSync(carpeta, { recursive: true });

// 1. Respaldo
const pgDump = process.env.PG_DUMP || (existsSync("C:\\pgsql\\bin\\pg_dump.exe") ? "C:\\pgsql\\bin\\pg_dump.exe" : "pg_dump");
const archivo = join(carpeta, `respaldo-valores-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
const dump = spawnSync(pgDump, [
  "--data-only", "--column-inserts", "--encoding=UTF8",
  "-h", url.hostname, "-p", url.port || "5432", "-U", decodeURIComponent(url.username), "-d", url.pathname.slice(1),
  "-t", "records", "-t", "presupuestos", "-t", "presupuesto_categorias", "-f", archivo,
], { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, encoding: "utf8" });
if (dump.status !== 0) {
  console.error("No se pudo sacar el respaldo; no se cambió nada.\n", dump.stderr || dump.error?.message);
  process.exit(1);
}
console.log("Respaldo:", archivo);

// 2. Cambios
const prisma = new PrismaClient();
const factor = (min, max) => Math.round((min + Math.random() * (max - min)) * 100) / 100;
const aMiles = (v) => (v == null ? null : Math.max(1000, Math.round(v / 1000) * 1000));
const aCienMil = (v) => (v == null ? null : Math.max(100000, Math.round(v / 100000) * 100000));

try {
  const records = await prisma.record.findMany({ select: { id: true, valorConIva: true, valorSinIva: true, valorCot: true, valorUsd: true } });
  const presupuestos = await prisma.presupuesto.findMany({ select: { id: true, valorArea: true } });
  const categorias = await prisma.presupuestoCategoria.findMany({ select: { id: true, valor: true } });

  let compras = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of records) {
      if (r.valorConIva == null && r.valorSinIva == null && r.valorCot == null && r.valorUsd == null) continue;
      const f = factor(0.55, 1.75);
      await tx.record.update({
        where: { id: r.id },
        data: {
          valorConIva: r.valorConIva == null ? null : aMiles(r.valorConIva * f),
          valorSinIva: r.valorSinIva == null ? null : aMiles(r.valorSinIva * f),
          valorCot: r.valorCot == null ? null : aMiles(r.valorCot * f),
          valorUsd: r.valorUsd == null ? null : Math.round(r.valorUsd * f * 100) / 100,
        },
      });
      compras++;
    }
    for (const p of presupuestos) {
      if (p.valorArea == null) continue;
      await tx.presupuesto.update({ where: { id: p.id }, data: { valorArea: aCienMil(p.valorArea * factor(0.6, 1.6)) } });
    }
    for (const c of categorias) {
      await tx.presupuestoCategoria.update({ where: { id: c.id }, data: { valor: aCienMil(c.valor * factor(0.6, 1.6)) } });
    }
  }, { timeout: 120000 });

  const resumen = `${compras} compras, ${presupuestos.filter((p) => p.valorArea != null).length} presupuestos por área y ${categorias.length} por categoría`;
  await prisma.auditLog.create({
    data: {
      action: "editar",
      entityType: "record",
      recordId: `valores-local-${Date.now()}`,
      recordInfo: `Valores alterados en la BD LOCAL para que no se parezcan a producción: ${resumen} (respaldo: ${archivo})`,
      userNombre: "Script local (alterarValoresLocal)",
    },
  });
  console.log(`Listo: ${resumen}.`);
} finally {
  await prisma.$disconnect();
}
