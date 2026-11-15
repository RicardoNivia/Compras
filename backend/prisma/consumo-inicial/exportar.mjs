// Exporta lo cargado en Consumo en la BD LOCAL (cuentas, medidores, recibos, cargos, historial y los PDF de soporte) a
// esta carpeta: datos.json + archivos/<sha1>.<ext>. Lo que quede aquí es lo que `cargar.mjs` lleva a producción en el
// siguiente despliegue. Uso (desde backend/):  node --env-file=.env prisma/consumo-inicial/exportar.mjs
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
if (!/@(localhost|127\.0\.0\.1):/.test(process.env.DATABASE_URL || "")) { console.error("Solo se exporta desde la BD local."); process.exit(2); }
const prisma = new PrismaClient();
const EXT = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const n = (v) => (v == null ? null : Number(v));

const sedes = await prisma.sedeConsumo.findMany({ orderBy: { id: "asc" } });
const empresas = await prisma.empresaConsumo.findMany({ orderBy: { id: "asc" } });
const cuentas = await prisma.cuentaConsumo.findMany({ orderBy: { id: "asc" }, include: { sede: true, empresa: true, medidores: { orderBy: { id: "asc" } }, recibos: { orderBy: { periodoHasta: "asc" }, include: { medidor: true, cargos: { orderBy: [{ orden: "asc" }, { id: "asc" }] }, historial: { orderBy: [{ anio: "asc" }, { mes: "asc" }] }, soportes: { orderBy: { id: "asc" } } } } } });

const dirArchivos = path.join(aqui, "archivos");
fs.rmSync(dirArchivos, { recursive: true, force: true });
fs.mkdirSync(dirArchivos, { recursive: true });
let archivos = 0, bytes = 0, recibos = 0;

const datos = {
  exportado: new Date().toISOString(),
  sedes: sedes.map((s) => ({ nombre: s.nombre, edificio: s.edificio, direccion: s.direccion, ciudad: s.ciudad, activo: s.activo })),
  empresas: empresas.map((e) => ({ nombre: e.nombre, nit: e.nit, servicios: e.servicios, activo: e.activo })),
  cuentas: cuentas.map((c) => ({
    sede: c.sede.nombre, servicio: c.servicio, empresa: c.empresa?.nombre || null, numeroCuenta: c.numeroCuenta, titular: c.titular, claseUso: c.claseUso, estrato: c.estrato,
    periodicidad: c.periodicidad, direccionRecibo: c.direccionRecibo, noAplica: c.noAplica, activo: c.activo, creadoPorNombre: c.creadoPorNombre,
    medidores: c.medidores.map((m) => ({ numero: m.numero, factor: n(m.factor), desde: m.desde, hasta: m.hasta })),
    recibos: c.recibos.map((r) => {
      recibos++;
      return {
        medidor: r.medidor?.numero || null, numeroFactura: r.numeroFactura, periodoDesde: r.periodoDesde, periodoHasta: r.periodoHasta, dias: r.dias, anio: r.anio, mes: r.mes, tipoLectura: r.tipoLectura,
        lecturaAnterior: n(r.lecturaAnterior), lecturaActual: n(r.lecturaActual), factor: n(r.factor), consumo: n(r.consumo), unidad: r.unidad, vigenciaTarifa: r.vigenciaTarifa, valorUnitario: n(r.valorUnitario),
        totalCargos: n(r.totalCargos), saldoAnterior: n(r.saldoAnterior), totalPagar: n(r.totalPagar), moneda: r.moneda, fechaExpedicion: r.fechaExpedicion, fechaPagoOportuno: r.fechaPagoOportuno, fechaSuspension: r.fechaSuspension,
        estadoPago: r.estadoPago, valorPagado: n(r.valorPagado), fechaPago: r.fechaPago, origen: r.origen, extras: r.extras, nota: r.nota, creadoPorNombre: r.creadoPorNombre,
        cargos: r.cargos.map((x) => ({ grupo: x.grupo, concepto: x.concepto, cantidad: n(x.cantidad), valorUnitario: n(x.valorUnitario), valor: n(x.valor), orden: x.orden })),
        historial: r.historial.map((h) => ({ anio: h.anio, mes: h.mes, etiqueta: h.etiqueta, consumo: n(h.consumo) })),
        soportes: r.soportes.map((s) => {
          const archivo = `${s.sha1}${EXT[s.tipoMime] || ""}`;
          fs.writeFileSync(path.join(dirArchivos, archivo), s.contenido);
          archivos++; bytes += s.tamano;
          return { nombre: s.nombre, tipoMime: s.tipoMime, tamano: s.tamano, sha1: s.sha1, archivo, creadoPorNombre: s.creadoPorNombre };
        }),
      };
    }),
  })),
};
fs.writeFileSync(path.join(aqui, "datos.json"), `${JSON.stringify(datos, null, 1)}\n`, "utf8");
console.log(`Exportado: ${datos.sedes.length} sedes, ${datos.empresas.length} empresas, ${datos.cuentas.length} cuentas, ${recibos} recibos y ${archivos} archivo(s) (${(bytes / 1048576).toFixed(1)} MB).`);
await prisma.$disconnect();
