// Carga inicial de Consumo: lleva a la base de datos lo que hay en esta carpeta (datos.json + archivos/), que se armó
// en local con exportar.mjs. Corre en cada despliegue (ver el CMD del Dockerfile) después de las migraciones:
//   - Solo hace algo la PRIMERA vez por versión de datos: deja una marca en Auditoría (entidad «cargaInicialConsumo»,
//     recordId = huella de datos.json). Si la marca existe, sale sin tocar nada: lo que alguien borre o edite después
//     en producción no vuelve a aparecer.
//   - Además no duplica: una sede, empresa o cuenta que ya existe se reutiliza, y un recibo con la misma factura o el
//     mismo período en la cuenta se salta.
//   - Si falla, no tumba el arranque de la app (el Dockerfile sigue con `npm start`).
// Uso manual (desde backend/):  node prisma/consumo-inicial/cargar.mjs   [--simular para ver qué haría]
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const simular = process.argv.includes("--simular");
const ruta = path.join(aqui, "datos.json");
if (!fs.existsSync(ruta)) { console.log("Carga inicial de Consumo: no hay datos.json, nada que cargar."); process.exit(0); }
const crudo = fs.readFileSync(ruta);
const huella = createHash("sha1").update(crudo).digest("hex").slice(0, 16);
const datos = JSON.parse(crudo.toString("utf8"));
const prisma = new PrismaClient();
const QUIEN = "Carga inicial";
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const claveNombre = (s) => sinTildes(s).replace(/[^a-z0-9]+/g, " ").trim();
const claveNumero = (s) => sinTildes(s).replace(/[^a-z0-9]+/g, "");

try {
  if (await prisma.auditLog.findFirst({ where: { entityType: "cargaInicialConsumo", recordId: huella } })) {
    console.log(`Carga inicial de Consumo: esta versión de los datos (${huella}) ya se cargó. Nada que hacer.`);
    process.exit(0);
  }
  const cuenta = { sedes: 0, empresas: 0, cuentas: 0, medidores: 0, recibos: 0, recibosYaEstaban: 0, soportes: 0, archivosFaltantes: 0 };

  const sedes = await prisma.sedeConsumo.findMany();
  const empresas = await prisma.empresaConsumo.findMany();
  const obtener = async (lista, modelo, d, contador) => {
    let x = lista.find((y) => claveNombre(y.nombre) === claveNombre(d.nombre));
    if (!x) {
      cuenta[contador]++;
      x = simular ? { id: -lista.length - 1, ...d } : await modelo.create({ data: { ...d, creadoPorNombre: QUIEN } });
      lista.push(x);
    }
    return x;
  };
  for (const s of datos.sedes || []) await obtener(sedes, prisma.sedeConsumo, s, "sedes");
  for (const e of datos.empresas || []) await obtener(empresas, prisma.empresaConsumo, e, "empresas");

  for (const c of datos.cuentas || []) {
    const sede = sedes.find((s) => claveNombre(s.nombre) === claveNombre(c.sede));
    if (!sede) { console.warn(`  Sede «${c.sede}» no encontrada: se salta su cuenta ${c.numeroCuenta || ""}.`); continue; }
    const empresa = c.empresa ? empresas.find((e) => claveNombre(e.nombre) === claveNombre(c.empresa)) : null;
    const delServicio = sede.id > 0 ? await prisma.cuentaConsumo.findMany({ where: { servicio: c.servicio }, include: { medidores: true } }) : [];
    let cta = c.noAplica ? delServicio.find((x) => x.sedeId === sede.id && x.noAplica) : delServicio.find((x) => x.numeroCuenta && claveNumero(x.numeroCuenta) === claveNumero(c.numeroCuenta));
    if (!cta) {
      // Una sede con cuenta real no recibe «no aplica», ni al revés.
      if (delServicio.some((x) => x.sedeId === sede.id && x.noAplica !== c.noAplica)) continue;
      cuenta.cuentas++;
      const { sede: _s, empresa: _e, medidores: _m, recibos: _r, creadoPorNombre, ...campos } = c;
      cta = simular ? { id: -1, medidores: [] } : await prisma.cuentaConsumo.create({ data: { ...campos, sedeId: sede.id, empresaId: empresa?.id || null, creadoPorNombre: creadoPorNombre || QUIEN }, include: { medidores: true } });
    }
    const medidores = [...cta.medidores];
    for (const m of c.medidores || []) {
      if (medidores.some((x) => claveNumero(x.numero) === claveNumero(m.numero))) continue;
      cuenta.medidores++;
      medidores.push(simular ? { id: -1, ...m } : await prisma.medidorConsumo.create({ data: { ...m, cuentaId: cta.id, creadoPorNombre: QUIEN } }));
    }
    const existentes = cta.id > 0 ? await prisma.reciboConsumo.findMany({ where: { cuentaId: cta.id }, select: { numeroFactura: true, periodoDesde: true, periodoHasta: true } }) : [];
    for (const r of c.recibos || []) {
      if (existentes.some((o) => (r.numeroFactura && o.numeroFactura && claveNumero(o.numeroFactura) === claveNumero(r.numeroFactura)) || (o.periodoDesde === r.periodoDesde && o.periodoHasta === r.periodoHasta))) { cuenta.recibosYaEstaban++; continue; }
      const { medidor, cargos, historial, soportes, creadoPorNombre, ...campos } = r;
      const quien = creadoPorNombre || QUIEN;
      const adjuntos = [];
      for (const s of soportes || []) {
        const f = path.join(aqui, "archivos", s.archivo);
        if (!fs.existsSync(f)) { cuenta.archivosFaltantes++; console.warn(`  Falta el archivo ${s.archivo} («${s.nombre}»).`); continue; }
        const contenido = fs.readFileSync(f);
        adjuntos.push({ nombre: s.nombre, tipoMime: s.tipoMime, tamano: contenido.length, sha1: createHash("sha1").update(contenido).digest("hex"), contenido, creadoPorNombre: s.creadoPorNombre || quien });
      }
      cuenta.recibos++; cuenta.soportes += adjuntos.length;
      if (simular) continue;
      // Un recibo entra completo o no entra (cargos, historial y soportes en la misma operación).
      await prisma.reciboConsumo.create({
        data: {
          ...campos, cuentaId: cta.id, medidorId: medidor ? medidores.find((x) => claveNumero(x.numero) === claveNumero(medidor))?.id || null : null, creadoPorNombre: quien,
          cargos: { create: (cargos || []).map((x) => ({ ...x, creadoPorNombre: quien })) },
          historial: { create: (historial || []).map((h) => ({ ...h, cuentaId: cta.id, creadoPorNombre: quien })) },
          soportes: { create: adjuntos },
        },
      });
    }
  }

  const resumen = `${cuenta.recibos} recibo(s) con ${cuenta.soportes} soporte(s), ${cuenta.cuentas} cuenta(s), ${cuenta.medidores} medidor(es), ${cuenta.sedes} sede(s) y ${cuenta.empresas} empresa(s) nuevos; ${cuenta.recibosYaEstaban} recibo(s) ya estaban${cuenta.archivosFaltantes ? `; ${cuenta.archivosFaltantes} archivo(s) faltantes` : ""}`;
  if (simular) { console.log(`Carga inicial de Consumo (simulación, no se escribió nada): ${resumen}.`); process.exit(0); }
  await prisma.auditLog.create({ data: { action: "importar", entityType: "cargaInicialConsumo", recordId: huella, recordInfo: `Carga inicial de Consumo: ${resumen}`, userNombre: QUIEN } });
  console.log(`Carga inicial de Consumo (${huella}): ${resumen}.`);
} catch (e) {
  console.error("Carga inicial de Consumo: falló y no se marcó como hecha (se reintenta en el próximo arranque).", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
