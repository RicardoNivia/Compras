// Carga en la base los registros producidos por herramientas/excel_a_json.py.
//
//   node prisma/importar-registros.mjs <archivo.json> [--agregar]
//
// Por defecto REEMPLAZA la tabla records (los datos del Excel son la fuente de
// verdad). Con --agregar conserva lo existente y solo añade.
// No toca usuarios ni conversaciones del agente.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

function numeroONulo(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function textoONulo(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

async function main() {
  const ruta = process.argv[2];
  const agregar = process.argv.includes("--agregar");
  if (!ruta) {
    console.error("Falta la ruta del JSON. Ver encabezado del archivo.");
    process.exit(1);
  }

  const { records, meta } = JSON.parse(readFileSync(ruta, "utf-8"));
  if (!Array.isArray(records) || records.length === 0) {
    console.error("El JSON no trae registros.");
    process.exit(1);
  }

  const previos = await prisma.record.count();
  const datos = records.map((r, i) => ({
    id: agregar ? undefined : r.id ?? `c${i + 1}`,
    informe: textoONulo(r.informe),
    fechaSolicitud: textoONulo(r.fechaSolicitud),
    fechaEntrega: textoONulo(r.fechaEntrega),
    area: textoONulo(r.area),
    responsable: textoONulo(r.responsable),
    estado: textoONulo(r.estado),
    categoria: textoONulo(r.categoria),
    descripcion: textoONulo(r.descripcion),
    medioPago: textoONulo(r.medioPago),
    licitacion: textoONulo(r.licitacion),
    estadoLegalizacion: textoONulo(r.estadoLegalizacion),
    proveedor: textoONulo(r.proveedor),
    fe: textoONulo(r.fe),
    valorConIva: numeroONulo(r.valorConIva),
    valorSinIva: numeroONulo(r.valorSinIva),
    valorCot: numeroONulo(r.valorCot),
    observaciones: textoONulo(r.observaciones),
    radicado: !!r.radicado,
  }));

  // Una sola transacción: si algo falla, la tabla queda como estaba.
  await prisma.$transaction(async (tx) => {
    if (!agregar) await tx.record.deleteMany();
    for (const d of datos) await tx.record.create({ data: d });
    await tx.meta.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        sourceFile: meta?.sourceFile ?? null,
        sourceSheet: meta?.sourceSheet ?? null,
        nextLocalSeq: meta?.nextLocalSeq ?? datos.length + 1,
      },
      update: {
        sourceFile: meta?.sourceFile ?? null,
        sourceSheet: meta?.sourceSheet ?? null,
        nextLocalSeq: meta?.nextLocalSeq ?? datos.length + 1,
      },
    });
  });

  const total = await prisma.record.count();
  console.log(
    `${agregar ? "Agregados" : "Reemplazados"}: ${datos.length} registros. ` +
      `Tabla records: ${previos} -> ${total}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
