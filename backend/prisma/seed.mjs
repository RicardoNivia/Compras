// Semilla de datos de EJEMPLO (no son los datos reales del negocio).
// Sirven solo para demostrar que la app funciona igual que el original.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const DEFAULT_ADMIN_USERS = [
  { nombre: "Administrador Demo", email: "admin@example.com" },
  { nombre: "Administrador Demo 2", email: "admin2@example.com" },
];
const DEFAULT_ADMIN_PASSWORD = "12345678";

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

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  for (const u of DEFAULT_ADMIN_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        nombre: u.nombre,
        email: u.email,
        password: passwordHash,
        role: "admin",
        activo: true,
      },
    });
  }

  console.log(`Seed OK: ${records.length} registros de ejemplo, ${DEFAULT_ADMIN_USERS.length} usuarios admin por defecto.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
