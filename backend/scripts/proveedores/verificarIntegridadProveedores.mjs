// Verificación de integridad del módulo de Proveedores (NIT = llave primaria, maestros por id).
//
// Uso (desde backend/):
//   node scripts/proveedores/verificarIntegridadProveedores.mjs              → solo reporta (lectura)
//   node scripts/proveedores/verificarIntegridadProveedores.mjs --corregir   → corrige lo que es seguro corregir
//
// Revisa:
//   1. NIT válidos (normalizados) y sin duplicados.
//   2. Registros de compra: proveedorNit existe (FK) y el snapshot "nit" coincide.
//   3. Calificaciones: proveedorNit existe.
//   4. Maestros de proveedor por id: existen, son del tipo correcto y el snapshot de texto coincide.
//   5. Maestros duplicados (mismo valor sin tildes/mayúsculas dentro de un tipo).
//   6. Ciclo vigente: excepciones / inactivos / NIT provisional sin ciclo; los demás con ciclo.
//   7. Permisos del rol Proveedores (Maestros y Nova).
// --corregir arregla 2 (snapshot nit), 4 (snapshot de texto), 6 (quita/crea ciclo vigente) y 7.

import { PrismaClient } from "@prisma/client";
import {
  normalizeNit, nitValido, anioCicloVigente, clasificacionEn, estadoInicial, CONFIG_PROVEEDORES_DEFAULT,
} from "../../lib/proveedoresCicloReglas.js";

const corregir = process.argv.includes("--corregir");
const prisma = new PrismaClient();
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const hallazgos = [];
function hallazgo(nivel, regla, detalle, n) {
  hallazgos.push({ nivel, regla, detalle, n });
}

const MAESTROS = [
  { tipo: "tipoProveedor", id: "tipoProveedorId", texto: "criticidad" },
  { tipo: "clasificacionMonto", id: "clasificacionMontoId", texto: "clasificacionMonto" },
  { tipo: "areaProveedor", id: "areaId", texto: "area" },
  { tipo: "tipoServicio", id: "tipoServicioId", texto: "servicio" },
  { tipo: "motivoExcepcion", id: "motivoExcepcionId", texto: "motivoExcepcion" },
];

try {
  const row = await prisma.configProveedores.findFirst();
  const cfg = row ? { diaCorte: row.diaCorte, mesCorte: row.mesCorte, diasAviso: row.diasAviso } : CONFIG_PROVEEDORES_DEFAULT;
  const anio = anioCicloVigente(new Date(), cfg);
  const [proveedores, maestros, ciclos] = await Promise.all([
    prisma.proveedor.findMany(),
    prisma.maestro.findMany({ where: { tipo: { in: MAESTROS.map((m) => m.tipo) } } }),
    prisma.proveedorCiclo.findMany({ where: { anio } }),
  ]);
  const maestroPorId = new Map(maestros.map((m) => [m.id, m]));
  const cicloPorNit = new Map(ciclos.map((c) => [c.proveedorNit, c]));

  // 1. NIT
  const malNormalizados = proveedores.filter((p) => !/^PEND/.test(p.nit) && (normalizeNit(p.nit) !== p.nit || !nitValido(p.nit)));
  if (malNormalizados.length) hallazgo("error", "NIT inválido o sin normalizar", malNormalizados.slice(0, 20).map((p) => `${p.nit} (${p.nombre})`), malNormalizados.length);
  const provisionales = proveedores.filter((p) => /^PEND/.test(p.nit));
  if (provisionales.length) hallazgo("aviso", "Proveedores con NIT provisional (registrar su NIT real)", provisionales.map((p) => `${p.nit} (${p.nombre})`), provisionales.length);

  // 2. Registros
  const [huerfanos] = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "records" r WHERE r."proveedorNit" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "proveedores" p WHERE p."nit" = r."proveedorNit")`;
  if (huerfanos.n) hallazgo("error", "Registros con proveedorNit inexistente", [], huerfanos.n);
  const [snap] = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "records" WHERE "proveedorNit" IS NOT NULL AND "nit" IS DISTINCT FROM "proveedorNit"`;
  if (snap.n) {
    hallazgo("aviso", "Registros con snapshot nit distinto a proveedorNit", [], snap.n);
    if (corregir) await prisma.$executeRaw`UPDATE "records" SET "nit" = "proveedorNit" WHERE "proveedorNit" IS NOT NULL AND "nit" IS DISTINCT FROM "proveedorNit"`;
  }

  // 3. Calificaciones
  const [calif] = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "calificaciones_proveedor" c WHERE c."proveedorNit" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "proveedores" p WHERE p."nit" = c."proveedorNit")`;
  if (calif.n) hallazgo("error", "Calificaciones con proveedorNit inexistente", [], calif.n);

  // 4. Maestros por id
  for (const def of MAESTROS) {
    const malos = [];
    const desfasados = [];
    for (const p of proveedores) {
      const id = p[def.id];
      if (!id) {
        if (p[def.texto] && def.tipo !== "motivoExcepcion") malos.push(`${p.nit}: texto "${p[def.texto]}" sin id de maestro`);
        continue;
      }
      const m = maestroPorId.get(id);
      if (!m || m.tipo !== def.tipo) malos.push(`${p.nit}: ${def.id}=${id} no es un maestro "${def.tipo}"`);
      else if (m.valor !== p[def.texto]) desfasados.push({ p, m });
    }
    if (malos.length) hallazgo("error", `Referencia inválida a maestro ${def.tipo}`, malos.slice(0, 20), malos.length);
    if (desfasados.length) {
      hallazgo("aviso", `Snapshot de texto desactualizado (${def.tipo})`, desfasados.slice(0, 10).map(({ p, m }) => `${p.nit}: "${p[def.texto]}" → "${m.valor}"`), desfasados.length);
      if (corregir) for (const { p, m } of desfasados) await prisma.proveedor.update({ where: { nit: p.nit }, data: { [def.texto]: m.valor } });
    }
  }
  const excepSinMotivo = proveedores.filter((p) => p.esExcepcion && !p.motivoExcepcionId);
  if (excepSinMotivo.length) hallazgo("error", "Excepciones sin motivo", excepSinMotivo.map((p) => p.nit), excepSinMotivo.length);

  // 5. Maestros duplicados
  const vistos = new Map();
  for (const m of maestros) {
    const k = `${m.tipo}|${norm(m.valor)}`;
    if (vistos.has(k)) hallazgo("aviso", "Maestro duplicado (mismo valor sin tildes/mayúsculas)", [`${m.tipo}: "${vistos.get(k)}" / "${m.valor}"`], 1);
    else vistos.set(k, m.valor);
  }

  // 6. Ciclo vigente
  const sobran = [];
  const faltan = [];
  for (const p of proveedores) {
    const cls = clasificacionEn(p, anio, cfg);
    const participa = cls === "actualizacion" || cls === "nuevo";
    const c = cicloPorNit.get(p.nit);
    if (!participa && c) sobran.push({ p, c, cls });
    if (participa && !c) faltan.push({ p, cls });
  }
  if (sobran.length) {
    hallazgo("aviso", `Proveedores que no participan (excepción/inactivo/provisional) con ciclo ${anio}`, sobran.slice(0, 20).map(({ p, cls }) => `${p.nit} (${cls})`), sobran.length);
    if (corregir) await prisma.proveedorCiclo.deleteMany({ where: { id: { in: sobran.filter(({ c }) => !c.aprobadoPorUserId).map(({ c }) => c.id) } } });
  }
  if (faltan.length) {
    hallazgo("aviso", `Proveedores que participan sin estado en el ciclo ${anio}`, faltan.slice(0, 20).map(({ p }) => `${p.nit} (${p.nombre})`), faltan.length);
    if (corregir) {
      for (const { p, cls } of faltan) {
        const estado = estadoInicial(p, anio, cfg);
        await prisma.proveedorCiclo.create({ data: { proveedorNit: p.nit, anio, clasificacion: cls, estado, aprobadoAt: estado === "actualizado" ? p.fechaActualizacion : null } });
      }
    }
  }

  // 7. Permisos del rol Proveedores
  const permisos = await prisma.rolePermission.findMany({ where: { role: "proveedores", feature: { in: ["viewMaestros", "viewAgenteIA"] } } });
  const negados = ["viewMaestros", "viewAgenteIA"].filter((f) => permisos.find((x) => x.feature === f)?.allowed === false);
  if (negados.length) {
    hallazgo("error", "El rol Proveedores tiene negado", negados, negados.length);
    if (corregir) for (const feature of negados) await prisma.rolePermission.update({ where: { role_feature: { role: "proveedores", feature } }, data: { allowed: true } });
  }

  // Resumen
  console.log(`Proveedores: ${proveedores.length} · ciclo vigente ${anio}: ${ciclos.length} con estado · maestros de proveedor: ${maestros.length}`);
  if (!hallazgos.length) console.log("OK · sin hallazgos de integridad.");
  for (const h of hallazgos) {
    console.log(`[${h.nivel.toUpperCase()}] ${h.regla}: ${h.n}`);
    if (h.detalle.length) console.log("   ", h.detalle.slice(0, 10).join(" · "));
  }
  if (corregir) console.log("\n--corregir: se aplicaron las correcciones seguras (snapshots, ciclo vigente, permisos). Vuelve a correr sin --corregir para confirmar.");
  if (hallazgos.some((h) => h.nivel === "error")) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
