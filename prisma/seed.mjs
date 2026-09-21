// Semilla de datos de EJEMPLO (no son los datos reales del negocio).
// Sirven solo para demostrar que la app funciona igual que el original.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  const raw = readFileSync(join(__dirname, "seed-data.json"), "utf-8");
  const { records, meta } = JSON.parse(raw);

  await prisma.record.deleteMany();
  for (const r of records) {
    await prisma.record.create({
      data: {
        id: r.id,
        informe: r.informe ?? null,
        fechaSolicitud: r.fechaSolicitud ?? null,
        fechaEntrega: r.fechaEntrega ?? null,
        area: r.area ?? null,
        responsable: r.responsable ?? null,
        estado: r.estado ?? null,
        categoria: r.categoria ?? null,
        descripcion: r.descripcion ?? null,
        medioPago: r.medioPago ?? null,
        licitacion: r.licitacion != null ? String(r.licitacion) : null,
        estadoLegalizacion: r.estadoLegalizacion ?? null,
        proveedor: r.proveedor ?? null,
        fe: r.fe != null ? String(r.fe) : null,
        valorConIva: r.valorConIva ?? null,
        valorSinIva: r.valorSinIva ?? null,
        valorCot: r.valorCot ?? null,
        observaciones: r.observaciones ?? null,
        radicado: !!r.radicado,
      },
    });
  }

  await prisma.meta.upsert({
    where: { id: 1 },
    update: {
      sourceFile: meta?.sourceFile ?? null,
      sourceSheet: meta?.sourceSheet ?? null,
      nextLocalSeq: meta?.nextLocalSeq ?? 1,
    },
    create: {
      id: 1,
      sourceFile: meta?.sourceFile ?? null,
      sourceSheet: meta?.sourceSheet ?? null,
      nextLocalSeq: meta?.nextLocalSeq ?? 1,
    },
  });

  console.log(`Seed OK: ${records.length} registros de ejemplo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
