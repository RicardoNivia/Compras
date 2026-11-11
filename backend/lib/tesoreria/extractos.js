import { prisma } from "@/lib/prisma";
import { publicarPagoPagado, publicarMovimientosRegistrados } from "@/lib/tesoreria/eventos";
import { logTesoreria } from "@/lib/audit";
import { revisarArchivoImportacion } from "@/lib/archivoSeguro";
import { leerExtracto } from "@/lib/tesoreria/parsersExtracto";
import { leerExtractoPdf } from "@/lib/tesoreria/extractoPdf";
import { clavesMovimientos } from "@/lib/tesoreria/plantillaExcel";
import { badRequest, limpiar, fmtMoneda, redondear } from "@/lib/tesoreria/comun";
import { reporteSaldos } from "@/lib/tesoreria/saldos";
import { diagnosticar } from "@/lib/tesoreria/conciliacion";

// Subir el extracto del banco (PDF, Excel .xlsx/.xls o CSV, como lo descarga el portal; del mes completo o parcial) en
// DOS pasos: 1) analizarExtracto lo lee y lo cruza con lo registrado SIN escribir nada: qué líneas son nuevas, cuáles ya
// están (misma huella, otro archivo del banco o registradas a mano), qué hay en el sistema que el banco no trae, y cómo
// quedan los saldos frente a los del extracto; 2) aplicarExtracto registra SOLO las líneas que la persona aprobó, deja
// verificado lo que el extracto confirma y, si lo aprueba, guarda los saldos del extracto como saldo del banco.

const num = (d) => (d == null ? null : Number(d));

// Análisis guardados en memoria hasta que la persona los aprueba (30 min): así el PDF no se vuelve a leer con Nova.
const ANALISIS = new Map();
const VIGENCIA_MS = 30 * 60 * 1000;
const purgar = () => { const ya = Date.now(); for (const [k, v] of ANALISIS) if (ya - v.creado > VIGENCIA_MS) ANALISIS.delete(k); };
const diaAntes = (f) => new Date(Date.parse(`${f}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

async function leerArchivo(actor, banco, buffer, nombre) {
  const esPdf = /\.pdf$/i.test(nombre || "");
  if (!esPdf && !/\.(xlsx|xls|csv)$/i.test(nombre || "")) throw badRequest("El extracto se sube en PDF, Excel (.xlsx, .xls) o CSV.");
  if (esPdf) {
    try {
      const leido = await leerExtractoPdf(buffer, nombre, banco);
      return { formato: "pdf", lineas: leido.lineas, aviso: leido.aviso, saldoInicial: leido.saldoInicial, saldoFinal: leido.saldoFinal };
    } catch (err) {
      if (err.rechazado) logTesoreria(actor, { action: "rechazar", entityType: "extractoTesoreria", recordId: banco.id, recordInfo: `Extracto PDF rechazado (${banco.nombre})`, after: { archivo: limpiar(nombre, 200), motivo: err.motivo } }).catch(() => {});
      throw err;
    }
  }
  revisarArchivoImportacion(buffer, nombre);
  const { formato, lineas, saldoInicial, saldoFinal } = leerExtracto(buffer, banco.formatoExtracto);
  let aviso = null;
  if (lineas?.length && saldoInicial != null && saldoFinal != null) {
    const suma = redondear(lineas.reduce((x, l) => x + l.valor, 0));
    const esperado = redondear(saldoFinal - saldoInicial);
    aviso = Math.abs(suma - esperado) > 0.01
      ? `Las ${lineas.length} líneas suman ${fmtMoneda(suma, banco.moneda)} pero el extracto pasa de ${fmtMoneda(saldoInicial, banco.moneda)} a ${fmtMoneda(saldoFinal, banco.moneda)}: al archivo puede faltarle o sobrarle alguna línea.`
      : null;
  }
  return { formato, lineas, aviso, saldoInicial, saldoFinal };
}

// Cruza las líneas del extracto con lo registrado del banco en esas fechas. Lo que ya está: 1) la misma línea (misma
// huella), 2) el mismo movimiento que llegó en OTRO archivo del banco (se reconoce por día, tipo y valor), 3) lo
// registrado a mano. Cada movimiento existente se usa una sola vez (dos cargos iguales el mismo día siguen siendo dos).
async function cruzar(banco, movs, desde, hasta) {
  const existentes = await prisma.movimientoBanco.findMany({ where: { bancoId: banco.id, fecha: { gte: desde, lte: hasta } }, select: { id: true, fecha: true, tipo: true, valor: true, descripcion: true, origen: true, claveImportacion: true, verificadoAt: true, creadoPorNombre: true }, orderBy: [{ fecha: "asc" }, { id: "asc" }] });
  const porClave = new Map(existentes.filter((x) => x.claveImportacion).map((x) => [x.claveImportacion, x]));
  const usados = new Set();
  const aMano = [];
  const nuevos = [];
  let mismaLinea = 0;
  let deOtroArchivo = 0;
  for (const m of movs) { const x = porClave.get(m.clave); if (x) { usados.add(x.id); mismaLinea++; } }
  for (const m of movs) {
    if (porClave.has(m.clave)) continue;
    const igual = existentes.find((x) => !usados.has(x.id) && x.fecha === m.fecha && x.tipo === m.tipo && Math.abs(Number(x.valor) - m.valor) < 0.5);
    if (igual) {
      usados.add(igual.id);
      if (igual.claveImportacion) deOtroArchivo++;
      else aMano.push({ movimientoId: igual.id, fecha: m.fecha, descripcion: m.descripcion, valor: m.valor, tipo: m.tipo });
      continue;
    }
    nuevos.push(m);
  }
  const soloEnSistema = existentes.filter((x) => !usados.has(x.id)).map((x) => ({ id: x.id, fecha: x.fecha, tipo: x.tipo, valor: Number(x.valor), descripcion: x.descripcion, origen: x.origen }));
  return { nuevos, aMano, mismaLinea, deOtroArchivo, soloEnSistema, existentes, usados };
}

// Paso 1: lee y cruza, sin escribir nada. Devuelve las diferencias para que la persona apruebe.
export async function analizarExtracto(actor, bancoId, buffer, nombre) {
  const banco = await prisma.bancoTesoreria.findUnique({ where: { id: Number(bancoId) || 0 } });
  if (!banco) throw badRequest("Elige el banco del extracto.");
  const { formato, lineas, aviso, saldoInicial, saldoFinal } = await leerArchivo(actor, banco, buffer, nombre);
  if (!lineas?.length) throw badRequest("No se reconocieron movimientos en el archivo: revisa que tenga fecha, descripción y valor.");
  const movs = clavesMovimientos(banco.id, lineas.filter((l) => l.valor).map((l) => ({
    fecha: l.fecha, tipo: l.valor < 0 ? "debito" : "credito", valor: Math.abs(l.valor), descripcion: l.descripcion || "(sin descripción)", tercero: l.tercero || null, concepto: l.etiqueta || null,
  })));
  const fechas = movs.map((m) => m.fecha).sort();
  const desde = fechas[0];
  const hasta = fechas.at(-1);
  const c = await cruzar(banco, movs, desde, hasta);
  // Saldos del sistema el día antes del extracto y al último día (sin lo nuevo), contra los del extracto.
  const antes = diaAntes(desde);
  const rep = await reporteSaldos(Number(hasta.slice(0, 4)), { bancoId: banco.id, dias: [antes, hasta] });
  const sEn = rep.items[0]?.saldosEn || {};
  const sistemaInicial = sEn[antes] ?? null;
  const sistemaFinal = sEn[hasta] ?? null;
  const netoNuevos = redondear(c.nuevos.reduce((x, m) => x + (m.tipo === "credito" ? m.valor : -m.valor), 0));
  const finalConNuevos = sistemaFinal == null ? null : redondear(sistemaFinal + netoNuevos);
  // Conciliación contable y dónde puede estar la diferencia (libros = sistema antes de registrar lo nuevo).
  const difLibros = sistemaFinal != null && saldoFinal != null ? redondear(sistemaFinal - saldoFinal) : null;
  const diag = diagnosticar({
    diferencia: difLibros, diferenciaInicial: sistemaInicial != null && saldoInicial != null ? redondear(sistemaInicial - saldoInicial) : null,
    delMes: c.existentes.map((x) => ({ ...x, extractoId: c.usados.has(x.id) ? -1 : null, verificadoAt: c.usados.has(x.id) ? true : null })),
    extractos: [{ id: 0, archivo: limpiar(nombre, 200), desde, hasta, pendientes: JSON.stringify(c.nuevos) }],
    desde, hasta, moneda: banco.moneda,
  });
  purgar();
  const token = crypto.randomUUID();
  ANALISIS.set(token, { creado: Date.now(), actorId: actor.id, bancoId: banco.id, archivo: limpiar(nombre, 200) || "extracto", formato, movs, desde, hasta, saldoInicial, saldoFinal });
  return {
    token, bancoId: banco.id, banco: banco.nombre, moneda: banco.moneda, archivo: nombre, formato, desde, hasta, lineas: movs.length, aviso,
    saldoInicial, saldoFinal,
    nuevos: c.nuevos.map((m) => ({ clave: m.clave, fecha: m.fecha, tipo: m.tipo, valor: m.valor, descripcion: m.descripcion, tercero: m.tercero })),
    yaCargados: c.mismaLinea + c.deOtroArchivo, deOtroArchivo: c.deOtroArchivo, aMano: c.aMano, soloEnSistema: c.soloEnSistema,
    conciliacion: { saldoBanco: saldoFinal, saldoLibros: sistemaFinal, diferencia: difLibros, ...diag.contable, explicado: diag.explicado, sinExplicar: diag.restante, pistas: diag.pistas.filter((p) => p.tipo !== "falta") },
    saldos: {
      sistemaInicial, difInicial: sistemaInicial != null && saldoInicial != null ? redondear(sistemaInicial - saldoInicial) : null,
      sistemaFinal, netoNuevos, finalConNuevos, difFinal: finalConNuevos != null && saldoFinal != null ? redondear(finalConNuevos - saldoFinal) : null,
    },
  };
}

// Paso 2: registra solo lo aprobado. aprobados = claves de las líneas nuevas; guardarSaldos = usar los saldos del
// extracto como saldo del banco (anclan los saldos y la conciliación).
export async function aplicarExtracto(actor, { token, aprobados = [], guardarSaldos = true } = {}) {
  purgar();
  const a = ANALISIS.get(token);
  if (!a || a.actorId !== actor.id) throw badRequest("El análisis venció o no es tuyo: vuelve a subir el extracto.");
  const banco = await prisma.bancoTesoreria.findUnique({ where: { id: a.bancoId } });
  if (!banco) throw badRequest("El banco ya no existe.");
  // Se vuelve a cruzar: pudo cambiar algo entre el análisis y la aprobación.
  const c = await cruzar(banco, a.movs, a.desde, a.hasta);
  const ok = new Set(aprobados);
  const aCrear = c.nuevos.filter((m) => ok.has(m.clave));
  const ext = await prisma.extractoBancario.create({
    data: { bancoId: banco.id, archivo: a.archivo, formato: a.formato, desde: a.desde, hasta: a.hasta, saldoInicial: guardarSaldos ? a.saldoInicial : null, saldoFinal: guardarSaldos ? a.saldoFinal : null, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null },
  });
  const ahora = new Date();
  if (aCrear.length) {
    await prisma.movimientoBanco.createMany({
      data: aCrear.map((m) => ({ bancoId: banco.id, tipo: m.tipo, fecha: m.fecha, descripcion: limpiar(m.descripcion, 300) || "(sin descripción)", valor: m.valor, moneda: banco.moneda, tercero: limpiar(m.tercero, 200), concepto: limpiar(m.concepto, 200), origen: "extracto", claveImportacion: m.clave, extractoId: ext.id, verificadoAt: ahora, verificadoPorNombre: `Extracto «${ext.archivo}»`, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null })),
      skipDuplicates: true,
    });
  }
  if (aCrear.length) {
    const nuevosIds = (await prisma.movimientoBanco.findMany({ where: { extractoId: ext.id, claveImportacion: { in: aCrear.map((m) => m.clave) } }, select: { id: true } })).map((x) => x.id);
    publicarMovimientosRegistrados(nuevosIds, actor, `desde el extracto «${ext.archivo}»`);
  }
  // Todo lo registrado que el extracto confirma (la misma línea, otro archivo del banco o registrado a mano) queda ligado
  // a este extracto: así la conciliación sabe qué está en el banco y qué no.
  if (c.usados.size) await prisma.movimientoBanco.updateMany({ where: { id: { in: [...c.usados] }, extractoId: null }, data: { extractoId: ext.id, verificadoAt: ahora, verificadoPorNombre: `Extracto «${ext.archivo}»` } });
  // Saldos del banco con su fecha: el inicial del primer día del extracto y el final del último. Un extracto parcial deja
  // el saldo a esa fecha; uno más viejo no reemplaza a uno más nuevo.
  const guardarSaldo = async (fecha, tipo, valor) => {
    if (valor == null || !fecha) return;
    const anio = Number(fecha.slice(0, 4));
    const mes = Number(fecha.slice(5, 7));
    const clave = `${banco.id}|${anio}|${mes}|${tipo}`;
    const ya = await prisma.saldoReportadoBanco.findUnique({ where: { clave } });
    if (ya && tipo === "final" && (!ya.fecha || ya.fecha > fecha)) return;
    if (ya && tipo === "inicial" && ya.fecha && ya.fecha < fecha) return;
    await prisma.saldoReportadoBanco.upsert({
      where: { clave },
      update: { valor, fecha, texto: `Extracto «${ext.archivo}»` },
      create: { bancoId: banco.id, anio, mes, tipo, valor, fecha, texto: `Extracto «${ext.archivo}»`, clave, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null },
    });
  };
  if (guardarSaldos) {
    await guardarSaldo(a.desde, "inicial", a.saldoInicial);
    await guardarSaldo(a.hasta, "final", a.saldoFinal);
  }
  const rechazados = c.nuevos.length - aCrear.length;
  const repetidos = c.mismaLinea + c.deOtroArchivo;
  // Lo no aprobado queda pendiente: la conciliación lo muestra como «el banco lo trae y no está registrado».
  const pendientes = c.nuevos.filter((m) => !ok.has(m.clave)).map((m) => ({ clave: m.clave, fecha: m.fecha, tipo: m.tipo, valor: m.valor, descripcion: m.descripcion, tercero: m.tercero || null }));
  await prisma.extractoBancario.update({ where: { id: ext.id }, data: { nuevos: aCrear.length, repetidos, pendientes: pendientes.length ? JSON.stringify(pendientes) : null } });
  ANALISIS.delete(token);
  logTesoreria(actor, {
    action: "importar", entityType: "extractoTesoreria", recordId: ext.id, recordInfo: `Extracto de ${banco.nombre} (${a.desde} a ${a.hasta})`,
    after: { banco: banco.nombre, archivo: ext.archivo, lineasAprobadas: aCrear.length, lineasNoAprobadas: rechazados, lineasRepetidas: repetidos, aMano: c.aMano.length, soloEnSistema: c.soloEnSistema.length, saldosGuardados: guardarSaldos ? "Sí" : "No" },
  }).catch(() => {});
  return { extractoId: ext.id, banco: banco.nombre, creados: aCrear.length, noAprobados: rechazados, verificados: c.aMano.length, saldosGuardados: !!guardarSaldos && (a.saldoInicial != null || a.saldoFinal != null) };
}

export async function listExtractos({ bancoId, page = 1, size = 10 } = {}) {
  size = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 10;
  const where = bancoId ? { bancoId: Number(bancoId) } : {};
  const total = await prisma.extractoBancario.count({ where });
  page = Math.min(Math.max(1, Number(page) || 1), Math.max(1, Math.ceil(total / size)));
  const [items, bancos] = await Promise.all([
    prisma.extractoBancario.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size }),
    prisma.bancoTesoreria.findMany({ select: { id: true, nombre: true } }),
  ]);
  const nombre = new Map(bancos.map((b) => [b.id, b.nombre]));
  return { items: items.map((e) => ({ ...e, saldoInicial: num(e.saldoInicial), saldoFinal: num(e.saldoFinal), banco: nombre.get(e.bancoId) })), total, page, size };
}
