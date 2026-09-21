// Carga los registros originales del panel (los mismos que traía el
// archivo HTML) en SQL Server. Se ejecuta con:
//   npx prisma db seed
// (o automáticamente después de "prisma migrate dev").

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

function toDate(v) {
  return v ? new Date(v) : null;
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

async function main() {
  const filePath = path.join(__dirname, "seed-records.json");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  console.log(`Cargando ${raw.length} registros en SQL Server...`);

  let count = 0;
  for (const r of raw) {
    const data = {
      informe: toStr(r.informe),
      fechaSolicitud: toDate(r.fechaSolicitud),
      fechaEntrega: toDate(r.fechaEntrega),
      area: toStr(r.area),
      responsable: toStr(r.responsable),
      estado: toStr(r.estado),
      categoria: toStr(r.categoria),
      descripcion: toStr(r.descripcion) || "(sin descripción)",
      medioPago: toStr(r.medioPago),
      licitacion: toStr(r.licitacion),
      estadoLegalizacion: toStr(r.estadoLegalizacion),
      proveedor: toStr(r.proveedor),
      fe: toStr(r.fe),
      valorConIva: toNum(r.valorConIva),
      valorSinIva: toNum(r.valorSinIva),
      valorCot: toNum(r.valorCot),
      observaciones: toStr(r.observaciones),
      radicado: !!r.radicado,
    };

    // upsert por el id original (c1, c2, ... ) para poder correr el
    // seed varias veces sin duplicar filas.
    await prisma.purchaseRecord.upsert({
      where: { id: r.id },
      update: data,
      create: { id: r.id, ...data },
    });
    count++;
  }

  console.log(`Listo: ${count} registros cargados/actualizados.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
