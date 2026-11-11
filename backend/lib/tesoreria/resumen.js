import { prisma } from "@/lib/prisma";
import { hoyColombia } from "@/lib/hoyColombia";
import { mapasCatalogos } from "@/lib/tesoreria/maestros";
import { reporteSaldos } from "@/lib/tesoreria/saldos";
import { fmtMoneda, redondear, sumarDias, TIPOS_PAGO, esIngreso, esEgreso } from "@/lib/tesoreria/comun";

// Cifras del Resumen de Tesorería, siempre calculadas aquí (la pantalla y Nova solo las muestran): lo del mes
// (pendientes y pagados), lo vencido, los movimientos sin asociar, las propuestas del agente, las alertas, el saldo de
// cada banco y los próximos pagos. Suman I, E y J (jornal, según su signo).

const num = (d) => (d == null ? 0 : Number(d));
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// vista "anual": las cifras del tablero (dashboard) son de todo el año; si no, del mes.
export async function resumenTesoreria({ anio, mes, vista } = {}) {
  const hoy = hoyColombia();
  anio = Number(anio) || Number(hoy.slice(0, 4));
  mes = Number(mes) || (anio === Number(hoy.slice(0, 4)) ? Number(hoy.slice(5, 7)) : 12);
  const [pagosAnio, vencidos, movs, propuestas, alertas, saldos, mapas] = await Promise.all([
    prisma.pagoProgramado.findMany({ where: { anio }, select: { id: true, mes: true, fecha: true, tipo: true, estado: true, valor: true, moneda: true, itemId: true, medioPagoId: true, pagadorId: true, conceptoId: true, concepto: true, _count: { select: { asociaciones: true } } } }),
    prisma.pagoProgramado.findMany({ where: { estado: "P", fecha: { lt: hoy }, tipo: { in: ["E", "I", "J"] } }, select: { id: true, fecha: true, valor: true, moneda: true, tipo: true, conceptoId: true, concepto: true, itemId: true }, orderBy: { fecha: "asc" } }),
    prisma.movimientoBanco.findMany({ where: { fecha: { gte: `${anio}-01-01`, lte: `${anio}-12-31` } }, select: { fecha: true, valor: true, verificadoAt: true, asociaciones: { select: { valor: true } } } }),
    prisma.propuestaPagoTesoreria.groupBy({ by: ["confianza"], where: { estado: "pendiente" }, _count: { _all: true } }),
    prisma.alertaTesoreria.count({ where: { resuelta: false } }),
    reporteSaldos(anio),
    mapasCatalogos(),
  ]);
  const delMes = pagosAnio.filter((p) => p.mes === mes);
  const suma = (lista) => redondear(lista.reduce((s, p) => s + num(p.valor), 0));
  const mesActual = {
    anio, mes, nombre: MESES[mes - 1],
    pendientes: delMes.filter((p) => p.estado === "P").length,
    pagados: delMes.filter((p) => p.estado === "E").length,
    egresosPendientes: suma(delMes.filter((p) => p.estado === "P" && esEgreso(p))),
    ingresosPendientes: suma(delMes.filter((p) => p.estado === "P" && esIngreso(p))),
    egresosPagados: suma(delMes.filter((p) => p.estado === "E" && esEgreso(p))),
    ingresosPagados: suma(delMes.filter((p) => p.estado === "E" && esIngreso(p))),
  };
  for (const k of ["egresosPendientes", "ingresosPendientes", "egresosPagados", "ingresosPagados"]) mesActual[`${k}Texto`] = fmtMoneda(mesActual[k]);
  const porMes = MESES.map((nombre, i) => {
    const l = pagosAnio.filter((p) => p.mes === i + 1);
    return {
      mes: i + 1, nombre,
      egresosPagados: Math.abs(suma(l.filter((p) => esEgreso(p) && p.estado === "E"))), egresosPendientes: Math.abs(suma(l.filter((p) => esEgreso(p) && p.estado === "P"))),
      ingresosPagados: suma(l.filter((p) => esIngreso(p) && p.estado === "E")), ingresosPendientes: suma(l.filter((p) => esIngreso(p) && p.estado === "P")),
      pagos: l.length,
    };
  });
  const sinAsociar = movs.filter((m) => num(m.valor) - m.asociaciones.reduce((s, a) => s + num(a.valor), 0) > 0.5).length;
  const prop = Object.fromEntries(propuestas.map((p) => [p.confianza, p._count._all]));
  const tablero = armarTablero({ anio, mes, vista, hoy, pagosAnio, vencidos, movs, saldos, mapas, porMes, suma });
  const proximosRaw = await prisma.pagoProgramado.findMany({ where: { estado: "P", fecha: { gte: hoy, lte: sumarDias(hoy, 7) } }, orderBy: [{ fecha: "asc" }, { id: "asc" }], take: 8 });
  return {
    anio, mes, hoy, mesActual, porMes, tablero,
    vencidos: { cantidad: vencidos.length, valor: suma(vencidos), valorTexto: fmtMoneda(suma(vencidos)), masViejo: vencidos[0]?.fecha || null, diasMasViejo: vencidos[0] ? Math.floor((Date.parse(hoy) - Date.parse(vencidos[0].fecha)) / 86400000) : 0 },
    movimientosSinAsociar: sinAsociar,
    propuestas: { total: (prop.alta || 0) + (prop.media || 0) + (prop.baja || 0), alta: prop.alta || 0, media: prop.media || 0, baja: prop.baja || 0 },
    alertasAbiertas: alertas,
    saldos: saldos.items.filter((b) => b.activo).map((b) => ({ bancoId: b.bancoId, banco: b.banco, moneda: b.moneda, saldoInicial: b.saldoInicial, saldoHoy: b.saldoHoy, saldoFinal: b.saldoFinal, texto: b.saldoHoy != null ? fmtMoneda(b.saldoHoy, b.moneda) : b.saldoFinal != null ? fmtMoneda(b.saldoFinal, b.moneda) : null })),
    proximos: proximosRaw.map((p) => ({
      id: p.id, fecha: p.fecha, tipo: p.tipo, tipoTexto: TIPOS_PAGO[p.tipo], concepto: mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto,
      item: p.itemId ? mapas.items.get(p.itemId)?.nombre : null, medioPago: p.medioPagoId ? mapas.medios.get(p.medioPagoId)?.nombre : null,
      valor: num(p.valor), valorTexto: fmtMoneda(p.valor, p.moneda),
    })),
  };
}

// Cifras del tablero (dashboard) de Tesorería: KPIs del período con su serie mensual, flujo de caja, saldos por banco mes
// a mes, egresos por ítem y por medio de pago, cumplimiento de los pagos y movimientos asociados. Todo calculado aquí.
function armarTablero({ anio, mes, vista, hoy, pagosAnio, vencidos, movs, saldos, mapas, porMes, suma }) {
  const anual = vista === "anual";
  const delPeriodo = pagosAnio.filter((p) => (anual || p.mes === mes) && ["I", "E", "J"].includes(p.tipo));
  const egr = delPeriodo.filter((p) => esEgreso(p));
  const ing = delPeriodo.filter((p) => esIngreso(p));
  const abs = (v) => Math.abs(redondear(v));
  const ingresos = suma(ing);
  const egresos = abs(suma(egr));
  const serieIng = porMes.map((m) => redondear(m.ingresosPagados + m.ingresosPendientes));
  const serieEgr = porMes.map((m) => redondear(m.egresosPagados + m.egresosPendientes));
  // Saldo total en bancos al cierre de cada mes (bancos activos con saldo calculable).
  const activos = saldos.items.filter((b) => b.activo);
  const serieSaldo = Array.from({ length: 12 }, (_, i) => {
    const vals = activos.map((b) => b.meses[i].saldoFinal).filter((v) => v != null);
    return vals.length ? redondear(vals.reduce((x, v) => x + v, 0)) : null;
  });
  const conSaldo = activos.filter((b) => (b.saldoHoy ?? b.saldoFinal) != null);
  const saldoTotal = conSaldo.length ? redondear(conSaldo.reduce((x, b) => x + (b.saldoHoy ?? b.saldoFinal), 0)) : null;
  // Cumplimiento: de lo que ya debía estar pagado (vence hasta hoy) en el período, cuánto está en E.
  const debian = delPeriodo.filter((p) => p.fecha <= hoy);
  const pagadosATiempo = debian.filter((p) => p.estado === "E").length;
  const agrupar = (lista, campo, mapa, sinNombre) => {
    const m = new Map();
    for (const p of lista) { const id = p[campo] || 0; m.set(id, (m.get(id) || 0) + Math.abs(Number(p.valor) || 0)); }
    return [...m.entries()].map(([id, valor]) => ({ id: id || null, nombre: id ? mapa.get(id)?.nombre || "—" : sinNombre, valor: redondear(valor) })).sort((a, b) => b.valor - a.valor);
  };
  const porItem = agrupar(egr, "itemId", mapas.items, "Sin ítem");
  const porMedio = agrupar(egr, "medioPagoId", mapas.medios, "Sin medio de pago");
  const topMedios = porMedio.slice(0, 5);
  if (porMedio.length > 5) topMedios.push({ id: null, nombre: "Otros", valor: redondear(porMedio.slice(5).reduce((x, y) => x + y.valor, 0)) });
  const movsPeriodo = movs.filter((m) => anual || Number(m.fecha.slice(5, 7)) === mes);
  const asociados = movsPeriodo.filter((m) => Number(m.valor) - m.asociaciones.reduce((x, a) => x + Number(a.valor), 0) <= 0.5).length;
  const nombreConcepto = (p) => mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto;
  const prefijo = anual ? `${anio}-` : `${anio}-${String(mes).padStart(2, "0")}-`;
  const vencidosPeriodo = vencidos.filter((p) => p.fecha.startsWith(prefijo));
  const fila = (p) => ({ id: p.id, fecha: p.fecha, concepto: nombreConcepto(p), item: p.itemId ? mapas.items.get(p.itemId)?.nombre || null : null, tipo: p.tipo, estado: p.estado || "P", valor: Number(p.valor), valorTexto: fmtMoneda(p.valor, p.moneda) });
  return {
    vista: anual ? "anual" : "mensual", anio, mes,
    kpis: {
      saldo: { valor: saldoTotal, serie: serieSaldo, bancos: activos.length, conSaldo: conSaldo.length },
      ingresos: { valor: ingresos, pendiente: suma(ing.filter((p) => p.estado === "P")), recibido: suma(ing.filter((p) => p.estado === "E")), serie: serieIng },
      egresos: { valor: egresos, pendiente: abs(suma(egr.filter((p) => p.estado === "P"))), pagado: abs(suma(egr.filter((p) => p.estado === "E"))), serie: serieEgr },
      neto: { valor: redondear(ingresos - egresos), serie: serieIng.map((v, i) => redondear(v - serieEgr[i])) },
      cumplimiento: { debian: debian.length, pagados: pagadosATiempo, pct: debian.length ? Math.round((pagadosATiempo / debian.length) * 1000) / 10 : null, vencidos: vencidosPeriodo.length, valorVencido: abs(suma(vencidosPeriodo)) },
    },
    flujo: porMes.map((m, i) => ({ mes: m.mes, nombre: m.nombre, ingresos: serieIng[i], egresos: serieEgr[i], neto: redondear(serieIng[i] - serieEgr[i]) })),
    serieSaldo,
    bancos: activos.map((b) => ({
      bancoId: b.bancoId, banco: b.banco, moneda: b.moneda, saldo: b.saldoHoy ?? b.saldoFinal, serie: b.meses.map((m) => m.saldoFinal),
      ultimoSaldoBanco: b.ultimoSaldoBanco,
      cuadran: b.meses.filter((m) => m.diferencia != null && Math.abs(m.diferencia) <= 0.5).length,
      diferencias: b.meses.filter((m) => m.diferencia != null && Math.abs(m.diferencia) > 0.5).length,
    })),
    porItem: porItem.slice(0, 8), porItemTotal: porItem.length, porMedio: topMedios,
    movimientos: { total: movsPeriodo.length, asociados, verificados: movsPeriodo.filter((m) => m.verificadoAt).length, sinAsociar: movsPeriodo.length - asociados },
    pagos: { total: delPeriodo.length, pagados: delPeriodo.filter((p) => p.estado === "E").length, pendientes: delPeriodo.filter((p) => p.estado === "P").length, conMovimiento: delPeriodo.filter((p) => p._count.asociaciones > 0).length },
    vencidos: vencidos.slice(0, 6).map((p) => ({ ...fila(p), dias: Math.floor((Date.parse(hoy) - Date.parse(p.fecha)) / 86400000) })),
    grandes: [...egr].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 5).map(fila),
  };
}
