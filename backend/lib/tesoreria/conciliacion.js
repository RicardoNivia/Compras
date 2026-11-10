import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { revisarArchivoImportacion } from "@/lib/archivoSeguro";
import { leerExtracto, patronDe } from "@/lib/tesoreria/parsersExtracto";
import { emparejar, signoEnCuenta, reglaPara, dias } from "@/lib/tesoreria/emparejar";
import { badRequest, notFound, rangoMes, exigirMesAbierto, fmtMoneda, limpiar } from "@/lib/tesoreria/comun";
import { crearMovimiento, mapasCatalogos, toClientMovimiento } from "@/lib/tesoreria/movimientos";

// Conciliación bancaria: líneas del extracto de cada cuenta contra los movimientos del libro.
// - Se enlaza solo lo que coincide SIN dudas (mismo valor con signo y fecha a ±3 días, o el mismo mes si el movimiento
//   vino del Excel con fecha aproximada, y un único candidato) o un grupo de líneas de la misma regla cuyo total es
//   exactamente el movimiento (el 4×1000 de un mes contra «Gastos bancarios» de ese mes).
// - Lo demás queda como sugerencia (la persona confirma), «solo en el banco» (se crea el movimiento con un clic, con
//   la regla aprendida) o «solo en el libro».
// - Cada enlace manual enseña una regla: «descripción del banco → concepto».

const num = (d) => (d == null ? 0 : Number(d));
const CENTAVO = 0.5;
export { signoEnCuenta, reglaPara };

const deLaCuenta = (cuentaId) => ({ OR: [{ cuentaId }, { cuentaDestinoId: cuentaId }] });

async function reglas() {
  return prisma.reglaClasificacion.findMany({ orderBy: [{ usos: "desc" }] });
}

async function aprenderRegla(actor, descripcion, mv) {
  const patron = patronDe(descripcion);
  if (!patron || patron.length < 4 || !mv.conceptoId) return;
  await prisma.reglaClasificacion.upsert({
    where: { patron },
    update: { conceptoId: mv.conceptoId, itemId: mv.itemId, pagadorId: mv.pagadorId, usos: { increment: 1 } },
    create: { patron, conceptoId: mv.conceptoId, itemId: mv.itemId, pagadorId: mv.pagadorId, usos: 1, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || "Conciliación" },
  }).catch(() => {});
}

// ---------- Importar extracto ----------

export async function importarExtracto(actor, cuentaId, buffer, nombre) {
  const cuenta = await prisma.cuentaTesoreria.findUnique({ where: { id: Number(cuentaId) || 0 } });
  if (!cuenta) throw badRequest("Elige la cuenta del extracto.");
  if (!/\.(xlsx|xls|csv)$/i.test(nombre || "")) throw badRequest("Por ahora el extracto se importa en Excel (.xlsx, .xls) o CSV, como lo descarga el portal del banco.");
  revisarArchivoImportacion(buffer, nombre); // contenido seguro: sin macros, objetos ni fórmulas peligrosas
  const { formato, lineas } = leerExtracto(buffer, cuenta.formatoExtracto);
  if (!lineas.length) throw badRequest("No se reconocieron movimientos en el archivo: revisa que tenga columnas de fecha, descripción y valor.");
  const firmados = new Set((await prisma.cierreMes.findMany({ select: { anio: true, mes: true } })).map((c) => `${c.anio}-${String(c.mes).padStart(2, "0")}`));
  const validas = lineas.filter((l) => !firmados.has(l.fecha.slice(0, 7)));
  const existentes = new Set((await prisma.lineaExtracto.findMany({ where: { cuentaId: cuenta.id, clave: { in: validas.map((l) => l.clave) } }, select: { clave: true } })).map((x) => x.clave));
  const nuevas = validas.filter((l) => !existentes.has(l.clave));
  const fechas = lineas.map((l) => l.fecha).sort();
  const extracto = await prisma.extractoBancario.create({
    data: { cuentaId: cuenta.id, archivo: limpiar(nombre, 200) || "extracto", desde: fechas[0], hasta: fechas.at(-1), lineasNuevas: nuevas.length, lineasRepetidas: lineas.length - nuevas.length, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null },
  });
  if (nuevas.length) {
    await prisma.lineaExtracto.createMany({
      data: nuevas.map((l) => ({ cuentaId: cuenta.id, extractoId: extracto.id, fecha: l.fecha, descripcion: limpiar(l.descripcion, 300) || "(sin descripción)", tercero: limpiar(l.tercero, 200), valor: l.valor, clave: l.clave, etiqueta: limpiar(l.etiqueta, 300), creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null })),
      skipDuplicates: true,
    });
  }
  const enlazadas = nuevas.length ? await autoConciliar(cuenta.id, { desde: fechas[0], hasta: fechas.at(-1) }) : 0;
  logTesoreria(actor, {
    action: "importar", entityType: "extractoTesoreria", recordId: extracto.id, recordInfo: `Extracto de ${cuenta.nombre} (${fechas[0]} a ${fechas.at(-1)})`,
    after: { cuenta: cuenta.nombre, archivo: extracto.archivo, lineasNuevas: nuevas.length, lineasRepetidas: lineas.length - nuevas.length, enlazadas },
  }).catch(() => {});
  return { formato, lineas: lineas.length, nuevas: nuevas.length, repetidas: lineas.length - nuevas.length, enMesesFirmados: lineas.length - validas.length, enlazadas, desde: fechas[0], hasta: fechas.at(-1) };
}

// ---------- Enlace automático ----------

export async function autoConciliar(cuentaId, { desde, hasta } = {}) {
  const rangoL = { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) };
  const lineas = await prisma.lineaExtracto.findMany({ where: { cuentaId, movimientoId: null, ignorada: false, ...(desde || hasta ? { fecha: rangoL } : {}) }, orderBy: { fecha: "asc" } });
  if (!lineas.length) return 0;
  const minF = lineas[0].fecha, maxF = lineas.at(-1).fecha;
  const desdeMov = `${minF.slice(0, 7)}-01`;
  const movs = await prisma.movimientoTesoreria.findMany({
    where: { ...deLaCuenta(cuentaId), estado: "ejecutado", fecha: { gte: desdeMov, lte: `${maxF.slice(0, 7)}-31` } },
    include: { lineas: { select: { cuentaId: true } } },
  });
  const libres = movs.filter((m) => !m.lineas.some((l) => l.cuentaId === cuentaId));
  const enlaces = emparejar({ cuentaId, lineas, movs: libres, reglas: await reglas() });
  let n = 0;
  for (const e of enlaces) {
    await prisma.lineaExtracto.updateMany({ where: { id: { in: e.lineaIds }, movimientoId: null }, data: { movimientoId: e.movimientoId, comoSeEnlazo: e.como, enlazadoAt: new Date(), enlazadoPorNombre: "Conciliación automática" } });
    n += e.lineaIds.length;
  }
  return n;
}

// ---------- Estado de una cuenta en un mes ----------

export async function estadoConciliacion(cuentaId, anio, mes) {
  const cuenta = await prisma.cuentaTesoreria.findUnique({ where: { id: Number(cuentaId) || 0 } });
  if (!cuenta) throw notFound("La cuenta no existe.");
  const { desde, hasta } = rangoMes(anio, mes);
  const [lineas, movs, mapas, rs, cierre] = await Promise.all([
    prisma.lineaExtracto.findMany({ where: { cuentaId: cuenta.id, fecha: { gte: desde, lte: hasta } }, orderBy: [{ fecha: "asc" }, { id: "asc" }] }),
    prisma.movimientoTesoreria.findMany({ where: { ...deLaCuenta(cuenta.id), fecha: { gte: desde, lte: hasta } }, include: { lineas: { select: { id: true, cuentaId: true } }, _count: { select: { soportes: true } } }, orderBy: { fecha: "asc" } }),
    mapasCatalogos(),
    reglas(),
    prisma.cierreMes.findUnique({ where: { anio_mes: { anio, mes } } }),
  ]);
  // Candidatos de sugerencia: movimientos del libro (también de meses vecinos) aún sin línea de esta cuenta.
  const vecinos = await prisma.movimientoTesoreria.findMany({
    where: { ...deLaCuenta(cuenta.id), fecha: { gte: rangoMes(mes === 1 ? anio - 1 : anio, mes === 1 ? 12 : mes - 1).desde, lte: rangoMes(mes === 12 ? anio + 1 : anio, mes === 12 ? 1 : mes + 1).hasta } },
    include: { lineas: { select: { cuentaId: true } }, _count: { select: { soportes: true, lineas: true } } },
  });
  const sinLinea = vecinos.filter((m) => !m.lineas.some((l) => l.cuentaId === cuenta.id));
  const cli = (m) => toClientMovimiento(m, mapas);
  const fm = (v) => fmtMoneda(v, cuenta.moneda);

  const activas = lineas.filter((l) => !l.ignorada);
  const enlazadas = activas.filter((l) => l.movimientoId);
  const sueltas = activas.filter((l) => !l.movimientoId);
  const sugerencias = [];
  const soloBanco = [];
  for (const l of sueltas) {
    const v = num(l.valor);
    const cands = sinLinea
      .filter((m) => Math.abs(signoEnCuenta(m, cuenta.id) - v) < CENTAVO && (m.fechaAproximada || dias(m.fecha, l.fecha) <= 20))
      .map((m) => ({ m, d: m.fechaAproximada ? 15 : dias(m.fecha, l.fecha) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    const linea = { id: l.id, fecha: l.fecha, descripcion: l.descripcion, tercero: l.tercero, valor: num(l.valor), valorTexto: fm(l.valor), etiqueta: l.etiqueta };
    if (cands.length) {
      sugerencias.push({ linea, candidatos: cands.map(({ m, d }) => ({ ...cli(m), razon: m.estado === "proyectado" ? `Proyectado por el mismo valor${m.fechaAproximada ? " en el mes" : `, ${Math.round(d)} día(s) de diferencia`}: al confirmarlo pasa a ejecutado` : m.fechaAproximada ? "Mismo valor; el movimiento vino del Excel solo con el mes" : `Mismo valor, ${Math.round(d)} día(s) de diferencia` })) });
    } else {
      const r = reglaPara(rs, l.descripcion);
      soloBanco.push({ ...linea, propuesta: r ? { conceptoId: r.conceptoId, concepto: mapas.conceptos.get(r.conceptoId)?.nombre, itemId: r.itemId, item: r.itemId ? mapas.items.get(r.itemId)?.nombre : null, pagadorId: r.pagadorId, usos: r.usos } : null });
    }
  }
  const ejecutadosDelMes = movs.filter((m) => m.estado === "ejecutado");
  const soloLibro = ejecutadosDelMes.filter((m) => !m.lineas.some((x) => x.cuentaId === cuenta.id)).map(cli);
  const netoBanco = activas.reduce((a, l) => a + num(l.valor), 0);
  const netoLibro = ejecutadosDelMes.reduce((a, m) => a + signoEnCuenta(m, cuenta.id), 0);
  return {
    cuenta: { id: cuenta.id, nombre: cuenta.nombre, moneda: cuenta.moneda, formatoExtracto: cuenta.formatoExtracto },
    periodo: { anio, mes, desde, hasta },
    firmado: cierre ? { por: cierre.firmadoPorNombre, at: cierre.createdAt } : null,
    tieneExtracto: lineas.length > 0,
    resumen: {
      netoBanco, netoBancoTexto: fm(netoBanco), netoLibro, netoLibroTexto: fm(netoLibro),
      diferencia: Math.round((netoBanco - netoLibro) * 100) / 100, diferenciaTexto: fm(netoBanco - netoLibro),
      lineas: activas.length, enlazadas: enlazadas.length, ignoradas: lineas.length - activas.length,
      pendientes: sueltas.length + soloLibro.length,
    },
    enlazadas: enlazadas.map((l) => ({ id: l.id, fecha: l.fecha, descripcion: l.descripcion, tercero: l.tercero, valorTexto: fm(l.valor), como: l.comoSeEnlazo, movimientoId: l.movimientoId, movimiento: (() => { const m = vecinos.find((x) => x.id === l.movimientoId) || movs.find((x) => x.id === l.movimientoId); return m ? `${m.concepto} · ${m.fecha}` : `#${l.movimientoId}`; })() })),
    sugerencias, soloBanco, soloLibro,
    ignoradas: lineas.filter((l) => l.ignorada).map((l) => ({ id: l.id, fecha: l.fecha, descripcion: l.descripcion, valorTexto: fm(l.valor) })),
  };
}

// ---------- Acciones de la persona ----------

async function lineaEditable(lineaId) {
  const l = await prisma.lineaExtracto.findUnique({ where: { id: Number(lineaId) || 0 } });
  if (!l) throw notFound("La línea del extracto no existe.");
  await exigirMesAbierto(l.fecha);
  return l;
}

export async function enlazar(actor, { lineaId, movimientoId }) {
  const l = await lineaEditable(lineaId);
  const mv = await prisma.movimientoTesoreria.findUnique({ where: { id: Number(movimientoId) || 0 } });
  if (!mv) throw notFound("El movimiento no existe.");
  if (mv.cuentaId !== l.cuentaId && mv.cuentaDestinoId !== l.cuentaId) throw badRequest("El movimiento es de otra cuenta.");
  await exigirMesAbierto(mv.fecha);
  // Un proyectado que aparece en el banco ya se ejecutó: toma la fecha real de la línea.
  const datosMov = {};
  if (mv.estado === "proyectado") Object.assign(datosMov, { estado: "ejecutado" });
  if (mv.estado === "proyectado" || mv.fechaAproximada) Object.assign(datosMov, { fecha: l.fecha, fechaAproximada: false });
  await prisma.$transaction([
    prisma.lineaExtracto.update({ where: { id: l.id }, data: { movimientoId: mv.id, comoSeEnlazo: "manual", enlazadoAt: new Date(), enlazadoPorNombre: actor.nombre || null } }),
    ...(Object.keys(datosMov).length ? [prisma.movimientoTesoreria.update({ where: { id: mv.id }, data: datosMov })] : []),
  ]);
  await aprenderRegla(actor, l.descripcion, mv);
  const cuenta = await prisma.cuentaTesoreria.findUnique({ where: { id: l.cuentaId } });
  logTesoreria(actor, { action: "conciliar", entityType: "conciliacionTesoreria", recordId: l.id, recordInfo: `${cuenta?.nombre}: ${l.descripcion} (${l.fecha})`, after: { cuenta: cuenta?.nombre, linea: `${l.fecha} · ${l.descripcion} · ${fmtMoneda(l.valor, cuenta?.moneda)}`, movimiento: `#${mv.id} ${mv.concepto}`, como: "manual" } }).catch(() => {});
  return { ok: true };
}

export async function desenlazar(actor, lineaId) {
  const l = await lineaEditable(lineaId);
  if (!l.movimientoId) return { ok: true };
  await prisma.lineaExtracto.update({ where: { id: l.id }, data: { movimientoId: null, comoSeEnlazo: null, enlazadoAt: null, enlazadoPorNombre: null } });
  logTesoreria(actor, { action: "desconciliar", entityType: "conciliacionTesoreria", recordId: l.id, recordInfo: `${l.descripcion} (${l.fecha})`, before: { linea: `${l.fecha} · ${l.descripcion}`, movimiento: `#${l.movimientoId}`, como: l.comoSeEnlazo } }).catch(() => {});
  return { ok: true };
}

export async function ignorarLinea(actor, lineaId, ignorar) {
  const l = await lineaEditable(lineaId);
  if (l.movimientoId && ignorar) throw badRequest("La línea está enlazada: quita el enlace antes de ignorarla.");
  await prisma.lineaExtracto.update({ where: { id: l.id }, data: { ignorada: !!ignorar } });
  logTesoreria(actor, { action: "editar", entityType: "conciliacionTesoreria", recordId: l.id, recordInfo: `${l.descripcion} (${l.fecha})`, before: { como: l.ignorada ? "ignorada" : "pendiente" }, after: { como: ignorar ? "ignorada" : "pendiente" } }).catch(() => {});
  return { ok: true };
}

// «Solo en el banco» → movimiento ejecutado con la fecha y el valor de la línea, enlazado a ella.
export async function crearDesdeLinea(actor, lineaId, body = {}) {
  const l = await lineaEditable(lineaId);
  if (l.movimientoId) throw badRequest("Esa línea ya está enlazada a un movimiento.");
  const v = num(l.valor);
  const mv = await crearMovimiento(actor, {
    tipo: body.tipo || (v >= 0 ? "ingreso" : "egreso"), estado: "ejecutado", fecha: l.fecha, valor: Math.abs(v), cuentaId: l.cuentaId,
    cuentaDestinoId: body.cuentaDestinoId, conceptoId: body.conceptoId, itemId: body.itemId, pagadorId: body.pagadorId,
    tercero: body.tercero ?? l.tercero, referencia: body.referencia, observacion: body.observacion ?? `Desde el extracto: ${l.descripcion}`,
  }, { origen: "extracto" });
  await prisma.lineaExtracto.update({ where: { id: l.id }, data: { movimientoId: mv.id, comoSeEnlazo: "creado", enlazadoAt: new Date(), enlazadoPorNombre: actor.nombre || null } });
  await aprenderRegla(actor, l.descripcion, mv);
  return mv;
}
