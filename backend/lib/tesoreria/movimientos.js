import { prisma } from "@/lib/prisma";
import { publicarPagoPagado, publicarMovimientosRegistrados } from "@/lib/tesoreria/eventos";
import { logTesoreria } from "@/lib/audit";
import { mapasCatalogos } from "@/lib/tesoreria/maestros";
import { asociarMovimiento, asignadoDe, recalcularEstados } from "@/lib/tesoreria/asociaciones";
import { badRequest, notFound, limpiar, numero, fechaValida, exigirMesAbierto, fmtMoneda, rangoMes, redondear, ESTADOS_PAGO, TIPOS_PAGO } from "@/lib/tesoreria/comun";

// Movimientos reales de los bancos (las pestañas «Mvto …» del Excel), con un formulario único: los campos comunes y
// los propios de algunos bancos (tipo de carga, tipo de solicitud, preparador, formato). Valor positivo; el tipo
// (débito sale / crédito entra) da el signo. Al registrarlo se puede asociar de una vez a uno o varios pagos
// programados indicando cuánto va a cada uno (opcional).

export const TIPOS_MOV = { debito: "Débito", credito: "Crédito" };
const num = (d) => (d == null ? 0 : Number(d));
const TAMANOS = [10, 25, 50, 100];

export function toClientMovimiento(m, mapas) {
  const valor = num(m.valor);
  const asignado = asignadoDe(m.asociaciones);
  return {
    id: m.id,
    bancoId: m.bancoId,
    banco: mapas.bancos.get(m.bancoId)?.nombre || "—",
    tipo: m.tipo,
    tipoTexto: TIPOS_MOV[m.tipo] || m.tipo,
    fecha: m.fecha,
    fechaAproximada: m.fechaAproximada,
    descripcion: m.descripcion,
    valor,
    moneda: m.moneda,
    valorTexto: fmtMoneda(valor, m.moneda),
    concepto: m.concepto,
    tercero: m.tercero,
    observacion: m.observacion,
    referencia: m.referencia,
    tipoCarga: m.tipoCarga,
    tipoSolicitud: m.tipoSolicitud,
    preparador: m.preparador,
    formato: m.formato,
    origen: m.origen,
    pagos: m.asociaciones?.length || 0,
    asignado,
    sinAsignar: redondear(valor - asignado),
    sinAsignarTexto: fmtMoneda(valor - asignado, m.moneda),
    soportes: m._count?.soportes ?? m.soportes?.length ?? 0,
    createdAt: m.createdAt,
    creadoPorNombre: m.creadoPorNombre,
  };
}

function whereDe(f) {
  const and = [];
  if (f.anio && f.mes) { const r = rangoMes(Number(f.anio), Number(f.mes)); and.push({ fecha: { gte: r.desde, lte: r.hasta } }); }
  else if (f.anio) and.push({ fecha: { gte: `${f.anio}-01-01`, lte: `${f.anio}-12-31` } });
  if (f.desde) and.push({ fecha: { gte: f.desde } });
  if (f.hasta) and.push({ fecha: { lte: f.hasta } });
  if (f.bancoId) and.push({ bancoId: Number(f.bancoId) });
  if (f.tipo && TIPOS_MOV[f.tipo]) and.push({ tipo: f.tipo });
  if (f.origen) and.push({ origen: f.origen });
  if (f.ids) and.push({ id: { in: String(f.ids).split(",").map(Number).filter(Boolean) } });
  if (f.q) {
    const t = String(f.q).trim();
    const n = Number(t.replace(/[^\d]/g, ""));
    and.push({ OR: [
      { descripcion: { contains: t, mode: "insensitive" } }, { concepto: { contains: t, mode: "insensitive" } }, { tercero: { contains: t, mode: "insensitive" } },
      { observacion: { contains: t, mode: "insensitive" } }, { referencia: { contains: t, mode: "insensitive" } },
      ...(n && /^[\d.,\s$]+$/.test(t) ? [{ valor: n }] : []),
    ] });
  }
  return and.length ? { AND: and } : {};
}

function pasaAsociacion(m, filtro) {
  if (filtro === "sin") return m.pagos === 0;
  if (filtro === "con") return m.pagos > 0;
  if (filtro === "parcial") return m.pagos > 0 && Math.abs(m.sinAsignar) > 0.5;
  if (filtro === "porAsignar") return Math.abs(m.sinAsignar) > 0.5;
  return true;
}

export async function listMovimientos(filtros = {}) {
  const size = TAMANOS.includes(Number(filtros.size)) ? Number(filtros.size) : 25;
  const [filas, mapas] = await Promise.all([
    prisma.movimientoBanco.findMany({
      where: whereDe(filtros),
      include: { asociaciones: { select: { valor: true } }, _count: { select: { soportes: true } } },
      orderBy: [{ fecha: filtros.orden === "antiguo" ? "asc" : "desc" }, { id: "desc" }],
    }),
    mapasCatalogos(),
  ]);
  const items = filas.map((m) => toClientMovimiento(m, mapas)).filter((m) => pasaAsociacion(m, filtros.asociacion));
  const totales = { creditos: 0, debitos: 0, sinAsociar: 0 };
  for (const m of items) {
    if (m.tipo === "credito") totales.creditos += m.valor; else totales.debitos += m.valor;
    if (m.pagos === 0) totales.sinAsociar++;
  }
  totales.creditos = redondear(totales.creditos);
  totales.debitos = redondear(totales.debitos);
  const total = items.length;
  const paginas = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number(filtros.page) || 1), paginas);
  return { items: items.slice((page - 1) * size, page * size), total, page, size, totales };
}

export async function getMovimiento(id) {
  const m = await prisma.movimientoBanco.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      soportes: { select: { id: true, nombre: true, tipoMime: true, tamano: true, createdAt: true, creadoPorNombre: true } },
      asociaciones: { include: { pago: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!m) throw notFound("El movimiento no existe.");
  const mapas = await mapasCatalogos();
  return {
    ...toClientMovimiento(m, mapas),
    listaSoportes: m.soportes,
    listaPagos: m.asociaciones.map((a) => ({
      asociacionId: a.id, pagoId: a.pagoId, valor: num(a.valor), valorTexto: fmtMoneda(a.valor, m.moneda), origen: a.origen,
      concepto: mapas.conceptos.get(a.pago.conceptoId)?.nombre || a.pago.concepto, item: a.pago.itemId ? mapas.items.get(a.pago.itemId)?.nombre : null,
      anio: a.pago.anio, mes: a.pago.mes, fecha: a.pago.fecha, tipo: a.pago.tipo, tipoTexto: TIPOS_PAGO[a.pago.tipo], estado: a.pago.estado, estadoTexto: ESTADOS_PAGO[a.pago.estado],
      valorPago: num(a.pago.valor), valorPagoTexto: fmtMoneda(a.pago.valor, a.pago.moneda),
    })),
  };
}

export async function datosMovimientoValidos(body, actual = null) {
  const v = (k) => (body[k] !== undefined ? body[k] : actual?.[k]);
  const tipo = v("tipo");
  if (!TIPOS_MOV[tipo]) throw badRequest("Tipo inválido: débito (sale) o crédito (entra).");
  const fecha = fechaValida(v("fecha"));
  const valor = Math.abs(numero(body.valor !== undefined ? body.valor : num(actual?.valor)));
  if (!(valor > 0)) throw badRequest("El valor debe ser mayor que cero (el tipo dice si entra o sale).");
  const banco = await prisma.bancoTesoreria.findUnique({ where: { id: Number(v("bancoId")) || 0 } });
  if (!banco || (!banco.activo && banco.id !== actual?.bancoId)) throw badRequest("Elige un banco activo.");
  const descripcion = limpiar(v("descripcion"), 300);
  if (!descripcion) throw badRequest("Escribe la descripción del movimiento (como aparece en el banco).");
  const t = (k, max = 300) => limpiar(v(k), max);
  return {
    bancoId: banco.id, moneda: banco.moneda, tipo, fecha, valor, descripcion,
    fechaAproximada: body.fecha !== undefined ? false : actual?.fechaAproximada ?? false,
    concepto: t("concepto", 200), tercero: t("tercero", 200), observacion: t("observacion", 1000), referencia: t("referencia", 120),
    tipoCarga: t("tipoCarga", 80), tipoSolicitud: t("tipoSolicitud", 80), preparador: t("preparador", 120), formato: t("formato", 120),
  };
}

export async function paraAuditoriaMov(m) {
  if (!m) return null;
  const mapas = await mapasCatalogos();
  return {
    banco: mapas.bancos.get(m.bancoId)?.nombre, tipo: TIPOS_MOV[m.tipo], fecha: m.fecha, valor: fmtMoneda(m.valor, m.moneda), descripcion: m.descripcion,
    concepto: m.concepto, tercero: m.tercero, observacion: m.observacion, referencia: m.referencia,
    tipoCarga: m.tipoCarga, tipoSolicitud: m.tipoSolicitud, preparador: m.preparador, formato: m.formato,
  };
}
export const resumenMov = (m) => `${m.fecha} · ${m.concepto || m.descripcion} · ${fmtMoneda(m.valor, m.moneda)}`;

// body.asociaciones (opcional): [{ pagoId, valor }] — se asocian al guardar.
export async function crearMovimiento(actor, body, { origen = "manual" } = {}) {
  const data = await datosMovimientoValidos(body);
  await exigirMesAbierto(data.fecha);
  if (data.referencia) {
    const dup = await prisma.movimientoBanco.findFirst({ where: { bancoId: data.bancoId, referencia: data.referencia }, select: { id: true, fecha: true } });
    if (dup) throw badRequest(`Ya hay un movimiento con la referencia ${data.referencia} en ese banco (#${dup.id}, ${dup.fecha}).`);
  }
  const m = await prisma.movimientoBanco.create({ data: { ...data, origen, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  logTesoreria(actor, { action: "crear", entityType: "movimientoTesoreria", recordId: m.id, recordInfo: resumenMov(m), after: await paraAuditoriaMov(m) }).catch(() => {});
  publicarMovimientosRegistrados(m.id, actor, origen === "soporte" ? "registrado con soporte" : "registrado a mano");
  if (Array.isArray(body.asociaciones) && body.asociaciones.length) {
    try {
      await asociarMovimiento(actor, m.id, body.asociaciones);
    } catch (err) {
      // El movimiento queda guardado; se avisa por qué no se pudo asociar.
      return { ...m, avisoAsociacion: err.message };
    }
  }
  return m;
}

export async function editarMovimiento(actor, id, body) {
  const actual = await prisma.movimientoBanco.findUnique({ where: { id: Number(id) || 0 }, include: { asociaciones: true } });
  if (!actual) throw notFound("El movimiento no existe.");
  await exigirMesAbierto(actual.fecha);
  const data = await datosMovimientoValidos(body, actual);
  await exigirMesAbierto(data.fecha);
  const asignado = asignadoDe(actual.asociaciones);
  if (!Array.isArray(body.asociaciones) && data.valor + 0.5 < asignado) {
    throw badRequest(`El movimiento ya tiene ${fmtMoneda(asignado, actual.moneda)} asignados a pagos: no puede valer menos. Ajusta primero lo asignado.`);
  }
  const m = await prisma.movimientoBanco.update({ where: { id: actual.id }, data });
  logTesoreria(actor, { action: "editar", entityType: "movimientoTesoreria", recordId: m.id, recordInfo: resumenMov(m), before: await paraAuditoriaMov(actual), after: await paraAuditoriaMov(m) }).catch(() => {});
  if (Array.isArray(body.asociaciones)) await asociarMovimiento(actor, m.id, body.asociaciones);
  return m;
}

export async function borrarMovimiento(actor, id) {
  const actual = await prisma.movimientoBanco.findUnique({ where: { id: Number(id) || 0 }, include: { asociaciones: true } });
  if (!actual) throw notFound("El movimiento no existe.");
  await exigirMesAbierto(actual.fecha);
  const pagoIds = actual.asociaciones.map((a) => a.pagoId);
  await prisma.$transaction(async (tx) => {
    await tx.movimientoBanco.delete({ where: { id: actual.id } });
    await recalcularEstados(tx, pagoIds);
  });
  logTesoreria(actor, { action: "eliminar", entityType: "movimientoTesoreria", recordId: actual.id, recordInfo: resumenMov(actual), before: await paraAuditoriaMov(actual) }).catch(() => {});
  return { ok: true };
}
