// Carga el Excel «Flujo de Caja 2026» al módulo de Tesorería (BD LOCAL; producción solo si se pide expresamente).
//
// Uso (desde backend/):
//   node scripts/tesoreria/importarFlujoCaja.mjs "<archivo.xlsx>"                         → solo muestra qué haría
//   node scripts/tesoreria/importarFlujoCaja.mjs "<archivo.xlsx>" --confirmar             → lo carga
//   ... --acceso=usuario@example.com   da acceso de firma a esa persona (si aún no tiene)
//   ... --reemplazar                   borra ANTES todo lo de Tesorería (movimientos, extractos, reglas, maestros, cierres)
//
// Qué carga:
//   · Maestros desde «Detalle 2026»: cuentas (medio de pago, moneda COP según ISO 4217), ítems, conceptos y pagadores,
//     sin duplicados escritos distinto (Otros/otros/OTros, «Costa »).
//   · Saldos iniciales de cada cuenta (filas tipo S del 1 de enero).
//   · Movimientos 2026 (I/E/J) con fecha aproximada (día 1 del mes, el Excel solo tiene el mes) y su estado
//     (E → ejecutado, P → proyectado). Los traslados entre cuentas propias se vuelven UN movimiento de traslado
//     (origen → destino) emparejando la salida y la entrada del mismo valor y mes.
//   · Extractos 2026 de las hojas «Mvto …»: el formato (tipo AV Villas o tipo Credicorp) se reconoce por las columnas y
//     cada hoja se asigna a la cuenta cuyos movimientos coinciden con más líneas, sin depender del nombre del banco
//     (las filas SALDO no son movimientos).
//   · Reglas de clasificación aprendidas de las etiquetas puestas a mano en los extractos (2023–2026) cuando
//     coinciden con un concepto, y la conciliación automática de lo que coincide sin dudas.
// El archivo se lee como binario (xlsx); los textos se limpian del carácter dañado U+FFFD.

import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { leerExtracto, patronDe } from "../../lib/tesoreria/parsersExtracto.js";
import { emparejar } from "../../lib/tesoreria/emparejar.js";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const confirmar = args.includes("--confirmar");
const reemplazar = args.includes("--reemplazar");
const accesoEmail = (args.find((a) => a.startsWith("--acceso=")) || "").split("=")[1];
if (!archivo) {
  console.error('Uso: node scripts/tesoreria/importarFlujoCaja.mjs "<archivo.xlsx>" [--confirmar] [--acceso=correo] [--reemplazar]');
  process.exit(1);
}

const CREADOR = { creadoPorNombre: "Importación Excel" };
const ANIO = 2026;
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const limpio = (s) => (s == null ? null : String(s).replace(/�/g, "").replace(/\s+/g, " ").trim() || null);
const clave = (s) => norm(s).replace(/s$/, "");

const buffer = readFileSync(archivo);
const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

// ---------- Detalle 2026 ----------
const hojaDetalle = wb.SheetNames.find((n) => norm(n) === "detalle 2026");
if (!hojaDetalle) { console.error("No encontré la hoja «Detalle 2026»."); process.exit(1); }
const crudas = XLSX.utils.sheet_to_json(wb.Sheets[hojaDetalle], { defval: null });
const filas = crudas.map((r, i) => {
  const o = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), typeof v === "string" ? limpio(v) : v]));
  return { fila: i + 2, item: o.Item, tipo: o["INGRESO/EGRESO"], estado: o.ESTADO, concepto: o.Concepto, medio: o["Medio de pago"], paga: o.Paga, anio: Number(o["Año"]), mes: Number(o.Mes), valor: Number(o.Valor) || 0 };
}).filter((f) => f.anio === ANIO && f.mes >= 1 && f.mes <= 12);

// El nombre más usado de cada grupo escrito distinto.
function canonicos(valores) {
  const grupos = new Map();
  for (const v of valores.filter(Boolean)) {
    const k = clave(v);
    if (!grupos.has(k)) grupos.set(k, new Map());
    grupos.get(k).set(v, (grupos.get(k).get(v) || 0) + 1);
  }
  const out = new Map();
  for (const [k, cuenta] of grupos) out.set(k, [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out; // clave → nombre
}

const esTraslado = (f) => f.tipo === "T" || /^tra[n]?slado/.test(norm(f.item)) || /^tra[n]?slado/.test(norm(f.concepto));
const esSaldo = (f) => f.tipo === "S";

// Tipo de cuenta por el nombre (no depende de qué banco sea; se puede corregir en Maestros de Tesorería).
function tipoDeCuenta(k) {
  if (/tarjeta/.test(k)) return { tipo: "tarjeta", nombre: "Tarjeta de crédito" };
  if (/efectivo|caja/.test(k)) return { tipo: "efectivo" };
  if (/^snc$/.test(k)) return { tipo: "otro" };
  return { tipo: "ahorros" };
}
const nombresCuenta = canonicos(filas.map((f) => f.medio));
const cuentas = [...nombresCuenta.entries()].map(([k, nombre]) => ({ k, nombre, ...tipoDeCuenta(k), moneda: "COP" }));
// La cuenta que nombra un texto, aunque esté mal escrita («Translado Pacificord», «Av villas»): el nombre completo,
// o el nombre sin su última letra si es largo.
const cuentaDeTexto = (t) => {
  const n = norm(t).replace(/[^a-z0-9 ]/g, " ");
  return cuentas.find((c) => n.includes(c.k) || n.includes(norm(c.nombre)) || (c.k.length >= 6 && n.includes(c.k.slice(0, -1)))) || null;
};

const operativas = filas.filter((f) => !esTraslado(f) && !esSaldo(f));
const nombresItem = canonicos(operativas.map((f) => f.item));
const nombresPagador = canonicos(filas.map((f) => f.paga));
const nombresConcepto = canonicos(operativas.map((f) => f.concepto));
// Ítem por defecto de cada concepto: el más usado.
const itemDeConcepto = new Map();
for (const [k] of nombresConcepto) {
  const conteo = new Map();
  for (const f of operativas.filter((x) => clave(x.concepto) === k)) conteo.set(clave(f.item), (conteo.get(clave(f.item)) || 0) + 1);
  itemDeConcepto.set(k, [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null);
}

// Saldos iniciales (filas S).
const saldos = new Map();
for (const f of filas.filter(esSaldo)) {
  const c = cuentaDeTexto(f.medio);
  if (c) saldos.set(c.k, (saldos.get(c.k) || 0) + Math.abs(f.valor));
}

// Movimientos operativos.
const movs = operativas.filter((f) => f.valor !== 0).map((f) => ({
  fila: f.fila, tipo: f.tipo === "E" ? "egreso" : "ingreso", estado: f.estado === "P" ? "proyectado" : "ejecutado",
  fecha: `${ANIO}-${String(f.mes).padStart(2, "0")}-01`, valor: Math.abs(f.valor),
  cuentaK: clave(f.medio), itemK: clave(f.item), conceptoK: clave(f.concepto), pagadorK: clave(f.paga),
}));

// Traslados: se empareja cada salida (E) con una entrada (I) del mismo valor y mes; lo que quede suelto toma la otra
// cuenta del texto del concepto («Translado Av villas», «Translado credicorp»…).
const tras = filas.filter((f) => esTraslado(f) && f.valor !== 0).map((f) => ({ ...f, usado: false, cuenta: cuentaDeTexto(f.medio), otra: cuentaDeTexto(f.concepto) }));
const traslados = [];
const sinPareja = [];
for (const s of tras.filter((t) => t.valor < 0)) {
  const e = tras.find((t) => !t.usado && t.valor > 0 && t.mes === s.mes && Math.abs(t.valor + s.valor) < 0.5 && t.cuenta?.k !== s.cuenta?.k);
  if (e) { e.usado = true; s.usado = true; traslados.push({ origen: s.cuenta, destino: e.cuenta, valor: Math.abs(s.valor), mes: s.mes, estado: s.estado === "P" ? "proyectado" : "ejecutado", texto: `${s.concepto} / ${e.concepto}`, filas: [s.fila, e.fila] }); }
}
for (const t of tras.filter((x) => !x.usado)) {
  const origen = t.valor < 0 ? t.cuenta : t.otra;
  const destino = t.valor < 0 ? t.otra : t.cuenta;
  if (origen && destino && origen.k !== destino.k) traslados.push({ origen, destino, valor: Math.abs(t.valor), mes: t.mes, estado: t.estado === "P" ? "proyectado" : "ejecutado", texto: t.concepto, filas: [t.fila] });
  else sinPareja.push(t);
}
// Un traslado sin la otra cuenta no se puede volver traslado: queda como ingreso/egreso con su concepto, así el total
// del año cuadra con el Excel.
const conceptoSuelto = "Traslado sin cuenta identificada";
for (const t of sinPareja) {
  movs.push({ fila: t.fila, tipo: t.valor < 0 ? "egreso" : "ingreso", estado: t.estado === "P" ? "proyectado" : "ejecutado", fecha: `${ANIO}-${String(t.mes).padStart(2, "0")}-01`, valor: Math.abs(t.valor), cuentaK: clave(t.medio), itemK: clave(t.item), conceptoK: clave(conceptoSuelto), pagadorK: clave(t.paga) });
  if (!nombresConcepto.has(clave(conceptoSuelto))) nombresConcepto.set(clave(conceptoSuelto), conceptoSuelto);
  if (t.item && !nombresItem.has(clave(t.item))) nombresItem.set(clave(t.item), t.item);
}

// ---------- Extractos ----------
function hojaComoLibro(nombre) {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, wb.Sheets[nombre], "extracto");
  return XLSX.write(w, { type: "buffer", bookType: "xlsx" });
}
// Las hojas «Mvto …» son extractos: el formato se reconoce por las columnas (no por el nombre del banco) y cada una se
// asigna a la cuenta cuyos movimientos del libro coinciden con más líneas (mismo valor con signo y mismo mes).
const del2026 = (ls) => ls.filter((l) => l.fecha.startsWith(`${ANIO}-`));
const signoMov = (m) => (m.tipo === "egreso" ? -m.valor : m.valor);
const extractos = [];
for (const hoja of wb.SheetNames.filter((n) => /^mvto/.test(norm(n)))) {
  let leido = null;
  for (const formato of ["avvillas", "credicorp"]) {
    const r = leerExtracto(hojaComoLibro(hoja), formato);
    if (r.formato === formato && r.lineas.length) { leido = r; break; }
  }
  if (!leido) { console.log(`La hoja «${hoja}» no tiene un formato de extracto conocido: se omite.`); continue; }
  const lineas2026 = del2026(leido.lineas);
  const puntaje = cuentas.map((c) => {
    const ms = movs.filter((m) => m.cuentaK === c.k);
    const n = lineas2026.filter((l) => ms.some((m) => m.fecha.slice(0, 7) === l.fecha.slice(0, 7) && Math.abs(signoMov(m) - l.valor) < 0.5)).length;
    return { c, n };
  }).sort((a, b) => b.n - a.n);
  const ya = new Set(extractos.map((e) => e.cuenta.k));
  const elegido = puntaje.find((p) => !ya.has(p.c.k) && p.n > 0);
  if (!elegido) { console.log(`No pude saber de qué cuenta es el extracto «${hoja}»: se omite.`); continue; }
  elegido.c.formatoExtracto = leido.formato;
  extractos.push({ hoja, cuenta: elegido.c, formato: leido.formato, todas: leido.lineas, coincidencias: elegido.n });
}

console.log(`Detalle ${ANIO}: ${filas.length} filas → ${movs.length} movimientos, ${traslados.length} traslados entre cuentas propias (${sinPareja.length} sin la otra cuenta, cargados como ingreso/egreso), ${filas.filter((f) => f.valor === 0).length} en cero omitidas.`);
console.log(`Maestros: ${cuentas.length} cuentas (${cuentas.map((c) => c.nombre).join(", ")}), ${nombresItem.size} ítems, ${nombresConcepto.size} conceptos, ${nombresPagador.size} pagadores (${[...nombresPagador.values()].join(", ")}).`);
console.log(`Saldos iniciales: ${[...saldos.entries()].map(([k, v]) => `${cuentas.find((c) => c.k === k)?.nombre} COP ${v.toLocaleString("es-CO")}`).join(" · ")}`);
console.log(`Extractos ${ANIO}: ${extractos.map((e) => `«${e.hoja.trim()}» (${e.formato}) → ${e.cuenta.nombre}: ${del2026(e.todas).length} líneas de ${e.todas.length}, ${e.coincidencias} coinciden con el libro`).join(" · ") || "ninguno"}.`);
if (sinPareja.length) console.log("Traslados sin la otra cuenta:",sinPareja.map((t) => `fila ${t.fila} ${t.concepto} ${t.valor}`).join(" | "));

if (!confirmar) {
  console.log("\nSimulación: no se escribió nada. Agrega --confirmar para cargarlo.");
  process.exit(0);
}

const prisma = new PrismaClient();
try {
  if (reemplazar) {
    await prisma.$transaction([
      prisma.lineaExtracto.deleteMany(), prisma.extractoBancario.deleteMany(), prisma.soporteMovimiento.deleteMany(), prisma.movimientoTesoreria.deleteMany(),
      prisma.reglaClasificacion.deleteMany(), prisma.cierreMes.deleteMany(), prisma.conceptoTesoreria.deleteMany(), prisma.itemTesoreria.deleteMany(),
      prisma.pagadorTesoreria.deleteMany(), prisma.cuentaTesoreria.deleteMany(),
    ]);
    console.log("Se borró lo que había en Tesorería.");
  } else if (await prisma.movimientoTesoreria.count()) {
    console.error("Tesorería ya tiene movimientos: usa --reemplazar para cargar de nuevo desde cero.");
    process.exit(1);
  }

  // Maestros
  const idCuenta = new Map();
  for (const c of cuentas) {
    const s = saldos.get(c.k) || 0;
    const fila = await prisma.cuentaTesoreria.upsert({ where: { nombre: c.nombre }, update: {}, create: { nombre: c.nombre, tipo: c.tipo, moneda: c.moneda, formatoExtracto: c.formatoExtracto || null, saldoInicial: s, saldoInicialFecha: s ? `${ANIO}-01-01` : null, ...CREADOR } });
    idCuenta.set(c.k, fila.id);
  }
  const idItem = new Map();
  for (const [k, nombre] of nombresItem) idItem.set(k, (await prisma.itemTesoreria.upsert({ where: { nombre }, update: {}, create: { nombre, ...CREADOR } })).id);
  const idPagador = new Map();
  for (const [k, nombre] of nombresPagador) idPagador.set(k, (await prisma.pagadorTesoreria.upsert({ where: { nombre }, update: {}, create: { nombre, ...CREADOR } })).id);
  const idConcepto = new Map();
  for (const [k, nombre] of nombresConcepto) idConcepto.set(k, (await prisma.conceptoTesoreria.upsert({ where: { nombre }, update: {}, create: { nombre, itemId: idItem.get(itemDeConcepto.get(k)) || null, ...CREADOR } })).id);
  const conceptoTraslado = await prisma.conceptoTesoreria.upsert({ where: { nombre: "Traslado entre cuentas propias" }, update: {}, create: { nombre: "Traslado entre cuentas propias", ...CREADOR } });

  // Movimientos
  await prisma.movimientoTesoreria.createMany({
    data: movs.map((m) => ({
      fecha: m.fecha, fechaAproximada: true, tipo: m.tipo, estado: m.estado, valor: m.valor, moneda: "COP", cuentaId: idCuenta.get(m.cuentaK),
      itemId: idItem.get(m.itemK) || null, conceptoId: idConcepto.get(m.conceptoK) || null, concepto: nombresConcepto.get(m.conceptoK) || "(sin concepto)", pagadorId: idPagador.get(m.pagadorK) || null,
      observacion: `Migrado de «${hojaDetalle}» (fila ${m.fila}); el Excel solo traía el mes.`, origen: "importacion", ...CREADOR,
    })),
  });
  await prisma.movimientoTesoreria.createMany({
    data: traslados.map((t) => ({
      fecha: `${ANIO}-${String(t.mes).padStart(2, "0")}-01`, fechaAproximada: true, tipo: "traslado", estado: t.estado, valor: t.valor, moneda: "COP",
      cuentaId: idCuenta.get(t.origen.k), cuentaDestinoId: idCuenta.get(t.destino.k), conceptoId: conceptoTraslado.id, concepto: conceptoTraslado.nombre,
      observacion: `Migrado de «${hojaDetalle}» (fila ${t.filas.join(" y ")}): ${t.texto}`, origen: "importacion", ...CREADOR,
    })),
  });

  // Reglas aprendidas de las etiquetas manuales de los extractos (todos los años), solo si coinciden con un concepto.
  const conceptoPorNombre = new Map([...nombresConcepto.entries()].map(([k]) => [k, idConcepto.get(k)]));
  const conceptoGastos = [...nombresConcepto.entries()].find(([, n]) => norm(n) === "gastos bancarios")?.[0];
  const votos = new Map();
  for (const l of extractos.flatMap((e) => e.todas)) {
    let k = l.etiqueta ? clave(l.etiqueta) : null;
    if (!conceptoPorNombre.has(k)) k = null;
    if (!k && /^(gmf|retencion|nota debito impuesto financiero)/.test(norm(l.descripcion)) && conceptoGastos) k = conceptoGastos;
    if (!k) continue;
    const p = patronDe(l.descripcion);
    if (!p || p.length < 4) continue;
    if (!votos.has(p)) votos.set(p, new Map());
    votos.get(p).set(k, (votos.get(p).get(k) || 0) + 1);
  }
  let nReglas = 0;
  for (const [patron, conteo] of votos) {
    const [k, usos] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
    await prisma.reglaClasificacion.upsert({ where: { patron }, update: {}, create: { patron, conceptoId: conceptoPorNombre.get(k), itemId: idItem.get(itemDeConcepto.get(k)) || null, usos, ...CREADOR } });
    nReglas++;
  }

  // Extractos 2026 + conciliación automática
  const reglas = await prisma.reglaClasificacion.findMany({ orderBy: { usos: "desc" } });
  for (const x of extractos) {
    const [nombreCuenta, lineas, hoja] = [x.cuenta.nombre, del2026(x.todas), x.hoja.trim()];
    const cuenta = await prisma.cuentaTesoreria.findUnique({ where: { nombre: nombreCuenta } });
    if (!cuenta || !lineas.length) continue;
    const fechas = lineas.map((l) => l.fecha).sort();
    const ex = await prisma.extractoBancario.create({ data: { cuentaId: cuenta.id, archivo: `${archivo.split(/[\\/]/).pop()} › ${hoja}`, desde: fechas[0], hasta: fechas.at(-1), lineasNuevas: lineas.length, ...CREADOR } });
    await prisma.lineaExtracto.createMany({
      data: lineas.map((l) => ({ cuentaId: cuenta.id, extractoId: ex.id, fecha: l.fecha, descripcion: limpio(l.descripcion)?.slice(0, 300) || "(sin descripción)", tercero: limpio(l.tercero)?.slice(0, 200) || null, valor: l.valor, clave: l.clave, etiqueta: limpio(l.etiqueta)?.slice(0, 300) || null, ...CREADOR })),
      skipDuplicates: true,
    });
    const ls = await prisma.lineaExtracto.findMany({ where: { cuentaId: cuenta.id, movimientoId: null, ignorada: false }, orderBy: { fecha: "asc" } });
    const ms = await prisma.movimientoTesoreria.findMany({ where: { estado: "ejecutado", OR: [{ cuentaId: cuenta.id }, { cuentaDestinoId: cuenta.id }] } });
    const enlaces = emparejar({ cuentaId: cuenta.id, lineas: ls, movs: ms, reglas });
    for (const e of enlaces) await prisma.lineaExtracto.updateMany({ where: { id: { in: e.lineaIds } }, data: { movimientoId: e.movimientoId, comoSeEnlazo: e.como, enlazadoAt: new Date(), enlazadoPorNombre: "Conciliación automática" } });
    console.log(`${nombreCuenta}: ${ls.length} líneas cargadas, ${enlaces.reduce((a, e) => a + e.lineaIds.length, 0)} enlazadas solas.`);
  }

  // Acceso de firma para quien se indique (arranque del módulo en local).
  if (accesoEmail) {
    const u = await prisma.user.findUnique({ where: { email: accesoEmail.toLowerCase() } });
    if (!u) console.log(`No existe el usuario ${accesoEmail}: no se dio acceso.`);
    else {
      await prisma.accesoTesoreria.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id, userNombre: u.nombre, nivel: "firma", ...CREADOR } });
      console.log(`Acceso de firma para ${u.nombre}.`);
    }
  }

  await prisma.auditLog.create({
    data: { action: "importar", entityType: "movimientoTesoreria", recordId: "importacion-excel", recordInfo: `Importación del Excel «${archivo.split(/[\\/]/).pop()}»: ${movs.length} movimientos, ${traslados.length} traslados, ${nReglas} reglas`, userNombre: "Importación Excel" },
  });
  console.log(`Listo: ${movs.length + traslados.length} movimientos y ${nReglas} reglas de clasificación.`);
} finally {
  await prisma.$disconnect();
}
