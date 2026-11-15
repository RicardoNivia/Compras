import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { mapasCatalogos, claveNombre } from "@/lib/tesoreria/maestros";
import { reporteSaldos } from "@/lib/tesoreria/saldos";
import { agendaPagos, saldosConEstado } from "@/lib/tesoreria/consultas";
import { rangoTesoreria, masDias } from "@/lib/tesoreria/periodos";
import { badRequest, fmtMoneda, redondear, TIPOS_PAGO } from "@/lib/tesoreria/comun";

// «Por resolver»: todo lo pendiente del operador en un solo lugar y en el orden del flujo del mes:
//   1. Extractos: meses ya cerrados sin extracto (por cuenta) y líneas de extractos que no se aprobaron.
//   2. Asociar: movimientos del banco sin pago y propuestas de los agentes por revisar.
//   3. Conciliar: pagos con diferencia (lo asociado no da lo programado).
//   4. Soportes: pagos de este mes y el anterior pagados con movimiento pero sin comprobante.
//   + Vencidos heredados: pendientes viejos (antes del mes pasado) que distorsionan lo que ve el gerente; se pueden
//     marcar como pagados en bloque (marcarPagadosEnBloque), sin avisos por cada uno.

const num = (d) => (d == null ? 0 : Number(d));
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export async function porResolver() {
  const hoy = hoyColombia();
  const anio = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const mapas = await mapasCatalogos();
  const nombreBanco = (id) => mapas.bancos.get(id)?.nombre || "—";

  // 1a. Meses cerrados del año sin extracto, por cuenta (solo cuentas con movimientos ese mes).
  const rep = await reporteSaldos(anio);
  const mesesSinExtracto = rep.items.filter((b) => b.activo).map((b) => ({
    bancoId: b.bancoId, banco: b.banco,
    meses: b.meses.filter((m) => m.mes < mesHoy && m.movimientos > 0 && m.estado === "estimado").map((m) => m.mes),
    noCuadran: b.meses.filter((m) => m.mes < mesHoy && m.estado === "diferencia").map((m) => ({ mes: m.mes, diferencia: m.diferencia, diferenciaTexto: fmtMoneda(m.diferencia, b.moneda) })),
  })).filter((b) => b.meses.length || b.noCuadran.length);

  // 1b. Líneas de extractos sin aprobar que siguen sin registrarse.
  const extractos = await prisma.extractoBancario.findMany({ where: { pendientes: { not: null } }, orderBy: { createdAt: "desc" } });
  const lineas = [];
  for (const e of extractos) {
    let lista = [];
    try { lista = JSON.parse(e.pendientes || "[]"); } catch { lista = []; }
    for (const l of lista) lineas.push({ ...l, extractoId: e.id, archivo: e.archivo, bancoId: e.bancoId, banco: nombreBanco(e.bancoId), valorTexto: fmtMoneda(l.tipo === "debito" ? -l.valor : l.valor) });
  }

  // 2. Movimientos sin pago (del año) y propuestas pendientes.
  const movs = await prisma.movimientoBanco.findMany({ where: { fecha: { gte: `${anio}-01-01` } }, include: { asociaciones: { select: { valor: true } } }, orderBy: { fecha: "desc" } });
  const sinPago = movs.filter((m) => num(m.valor) - m.asociaciones.reduce((s, a) => s + num(a.valor), 0) > 0.5);
  const props = await prisma.propuestaPagoTesoreria.groupBy({ by: ["agente", "confianza"], where: { estado: "pendiente" }, _count: { _all: true } });
  const propuestas = { movimientos: 0, pagos: 0, alta: 0 };
  for (const p of props) { propuestas[p.agente] = (propuestas[p.agente] || 0) + p._count._all; if (p.confianza === "alta") propuestas.alta += p._count._all; }

  // 3. Pagos con diferencia (lo asociado no da lo programado).
  const conAsoc = await prisma.pagoProgramado.findMany({ where: { asociaciones: { some: {} } }, include: { asociaciones: { select: { valor: true } } } });
  const conDiferencia = conAsoc.map((p) => ({ p, asignado: p.asociaciones.reduce((s, a) => s + num(a.valor), 0) }))
    .filter((x) => Math.abs(x.asignado - Math.abs(num(x.p.valor))) > 0.5)
    .sort((a, b) => b.p.fecha.localeCompare(a.p.fecha)).slice(0, 50)
    .map(({ p, asignado }) => ({ id: p.id, fecha: p.fecha, concepto: mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto, item: p.itemId ? mapas.items.get(p.itemId)?.nombre : null, programado: fmtMoneda(p.valor, p.moneda), asociado: fmtMoneda(asignado, p.moneda), diferencia: fmtMoneda(asignado - Math.abs(num(p.valor)), p.moneda) }));

  // 4. Pagos con movimiento pero sin soporte (este mes y el anterior).
  const desdeSoportes = rangoTesoreria("mes_anterior").desde;
  const sinSoporte = await prisma.pagoProgramado.findMany({
    where: { estado: "E", fecha: { gte: desdeSoportes, lte: hoy }, asociaciones: { some: { movimiento: { soportes: { none: {} } } } } },
    orderBy: { fecha: "desc" }, take: 50,
  });

  // Vencidos heredados: pendientes de antes del mes pasado.
  const corte = desdeSoportes; // primer día del mes pasado
  const viejos = await prisma.pagoProgramado.findMany({ where: { estado: "P", fecha: { lt: corte }, NOT: { valor: 0 }, tipo: { in: ["I", "E", "J", "T"] } }, select: { valor: true, fecha: true } });

  // 0. Soportes que llegaron al correo de soportes y que Nova ya leyó (ver lib/buzonCompartido.js).
  const soportesCorreo = await prisma.soporteCorreoTesoreria.count({ where: { estado: "pendiente" } });

  const pasos = [
    { k: "correo", titulo: "Soportes del correo", pendiente: soportesCorreo },
    { k: "extractos", titulo: "Subir extractos", pendiente: mesesSinExtracto.reduce((s, b) => s + b.meses.length, 0) + lineas.length },
    { k: "asociar", titulo: "Asociar movimientos y pagos", pendiente: sinPago.length },
    { k: "conciliar", titulo: "Resolver diferencias", pendiente: conDiferencia.length + mesesSinExtracto.reduce((s, b) => s + b.noCuadran.length, 0) },
    { k: "soportes", titulo: "Subir soportes", pendiente: sinSoporte.length },
  ];
  return {
    hoy, pasos,
    mesesSinExtracto: mesesSinExtracto.map((b) => ({ ...b, mesesTexto: b.meses.map((m) => MESES[m - 1]).join(", ") })),
    lineasPendientes: lineas,
    movimientosSinPago: { total: sinPago.length, recientes: sinPago.slice(0, 12).map((m) => ({ id: m.id, fecha: m.fecha, banco: nombreBanco(m.bancoId), descripcion: m.descripcion, tipo: m.tipo, valorTexto: fmtMoneda(m.tipo === "debito" ? -num(m.valor) : num(m.valor), m.moneda) })) },
    propuestas,
    pagosConDiferencia: conDiferencia,
    sinSoporte: sinSoporte.map((p) => ({ id: p.id, fecha: p.fecha, concepto: mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto, item: p.itemId ? mapas.items.get(p.itemId)?.nombre : null, valorTexto: fmtMoneda(p.valor, p.moneda) })),
    vencidosHeredados: { corte, cantidad: viejos.length, valorTexto: fmtMoneda(viejos.reduce((s, p) => s + Math.abs(num(p.valor)), 0)), masViejo: viejos.map((p) => p.fecha).sort()[0] || null },
  };
}

// Vista previa de la limpieza: los pendientes con vencimiento ANTES de `hasta` (por defecto el primer día del mes
// pasado), para que la persona desmarque los que de verdad siguen sin pagar.
export async function vistaVencidosHeredados({ hasta } = {}) {
  const corte = /^\d{4}-\d{2}-\d{2}$/.test(hasta || "") ? hasta : rangoTesoreria("mes_anterior").desde;
  const mapas = await mapasCatalogos();
  const pagos = await prisma.pagoProgramado.findMany({ where: { estado: "P", fecha: { lt: corte }, NOT: { valor: 0 }, tipo: { in: ["I", "E", "J", "T"] } }, orderBy: [{ fecha: "asc" }, { id: "asc" }] });
  return {
    hasta: corte,
    total: pagos.length,
    items: pagos.map((p) => ({ id: p.id, fecha: p.fecha, tipo: p.tipo, tipoTexto: TIPOS_PAGO[p.tipo], concepto: mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto, item: p.itemId ? mapas.items.get(p.itemId)?.nombre : null, medio: p.medioPagoId ? mapas.medios.get(p.medioPagoId)?.nombre : null, valor: num(p.valor), valorTexto: fmtMoneda(p.valor, p.moneda) })),
  };
}

// Marca en bloque como pagados (E) los pagos elegidos de la limpieza. Sin un aviso por cada uno (es una corrección de
// historia, no pagos nuevos); queda UNA entrada de auditoría con la lista. No toca meses cerrados.
export async function marcarPagadosEnBloque(actor, { ids = [], motivo = "" } = {}) {
  const lista = [...new Set(ids.map(Number).filter(Boolean))].slice(0, 2000);
  if (!lista.length) throw badRequest("Elige al menos un pago.");
  const cierres = await prisma.cierreMes.findMany({ select: { anio: true, mes: true } });
  const cerrado = new Set(cierres.map((c) => `${c.anio}-${c.mes}`));
  const pagos = await prisma.pagoProgramado.findMany({ where: { id: { in: lista }, estado: "P" } });
  const abiertos = pagos.filter((p) => !cerrado.has(`${p.anio}-${p.mes}`));
  if (!abiertos.length) throw badRequest("Ninguno de esos pagos está pendiente en un mes abierto.");
  await prisma.pagoProgramado.updateMany({ where: { id: { in: abiertos.map((p) => p.id) } }, data: { estado: "E", estadoPor: "manual" } });
  const total = abiertos.reduce((s, p) => s + Math.abs(num(p.valor)), 0);
  logTesoreria(actor, {
    action: "editar", entityType: "pagoTesoreria", recordId: `lote-${Date.now()}`,
    recordInfo: `Limpieza de vencidos heredados: ${abiertos.length} pago(s) marcados como pagados en bloque`,
    before: { estado: "P · Pendiente", pagos: abiertos.map((p) => `#${p.id} ${p.fecha} ${p.concepto}`).join(" | ").slice(0, 3000) },
    after: { estado: "E · Pagado (en bloque)", cantidad: abiertos.length, total: fmtMoneda(total), motivo: motivo || "Limpieza de vencidos heredados del Excel" },
  }).catch(() => {});
  return { marcados: abiertos.length, omitidos: lista.length - abiertos.length, total: fmtMoneda(total) };
}

// Proyección de caja por cuenta: el saldo de hoy de cada banco frente a lo que vence en el período (por defecto esta
// semana) con ese banco como medio de pago. Los medios que no son una cuenta registrada (tarjeta, efectivo, otra
// empresa) van aparte, sin saldo. vencidos: además, lo atrasado que se paga con esa cuenta.
export async function proyeccionCaja({ periodo = "esta_semana" } = {}) {
  const hoy = hoyColombia();
  const r = rangoTesoreria(periodo);
  const desde = r.desde < hoy ? hoy : r.desde;
  const mapas = await mapasCatalogos();
  const saldos = await saldosConEstado();
  const rep = await reporteSaldos(Number(hoy.slice(0, 4)));
  const ag = await agendaPagos({ desde: "2000-01-01", hasta: r.hasta, estado: "pendientes", limite: 1000 });
  const bancos = rep.items.filter((b) => b.activo);
  const bancoDeMedio = (medioId) => {
    if (!medioId) return null;
    const m = claveNombre(mapas.medios.get(medioId)?.nombre || "").replace(/^banco /, "").replace(/\s+/g, "");
    return bancos.find((b) => { const k = claveNombre(b.banco).replace(/^banco /, "").replace(/\s+/g, ""); return k && m && (k === m || k.includes(m) || m.includes(k)); })?.bancoId || null;
  };
  const cuentas = new Map(bancos.map((b) => [b.bancoId, { bancoId: b.bancoId, banco: b.banco, moneda: b.moneda, saldoHoy: b.saldoHoy, confirmado: saldos.bancos.find((x) => x.banco === b.banco)?.confirmado || false, sale: 0, entra: 0, vencido: 0, pagos: [] }]));
  const otros = new Map();
  for (const p of ag._pagos) {
    const v = num(p.valor);
    const vencido = p.fecha < desde;
    const enPeriodo = p.fecha >= desde && p.fecha <= r.hasta;
    if (!vencido && !enPeriodo) continue;
    const bancoId = bancoDeMedio(p.medioPagoId);
    const destino = bancoId ? cuentas.get(bancoId) : (() => { const k = p.medioPagoId ? mapas.medios.get(p.medioPagoId)?.nombre || "Otro" : "Sin medio de pago"; if (!otros.has(k)) otros.set(k, { medio: k, sale: 0, entra: 0, vencido: 0, pagos: [] }); return otros.get(k); })();
    if (vencido) { if (v < 0) destino.vencido += -v; continue; }
    if (v < 0) destino.sale += -v; else destino.entra += v;
    destino.pagos.push({ id: p.id, fecha: p.fecha, concepto: mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto, valor: v, valorTexto: fmtMoneda(v, p.moneda) });
  }
  const filas = [...cuentas.values()].map((c) => {
    const proyectado = c.saldoHoy == null ? null : redondear(c.saldoHoy + c.entra - c.sale);
    return {
      ...c, sale: redondear(c.sale), entra: redondear(c.entra), vencido: redondear(c.vencido), proyectado,
      conVencidos: proyectado == null ? null : redondear(proyectado - c.vencido),
      alcanza: proyectado == null ? null : proyectado >= 0,
      alcanzaConVencidos: proyectado == null ? null : proyectado - c.vencido >= 0,
      textos: { saldoHoy: c.saldoHoy == null ? "no se puede calcular" : fmtMoneda(c.saldoHoy, c.moneda), sale: fmtMoneda(c.sale, c.moneda), entra: fmtMoneda(c.entra, c.moneda), vencido: fmtMoneda(c.vencido, c.moneda), proyectado: proyectado == null ? "—" : fmtMoneda(proyectado, c.moneda) },
    };
  });
  return {
    periodo: r.label, desde, hasta: r.hasta, cuentas: filas,
    otrosMedios: [...otros.values()].map((o) => ({ ...o, sale: redondear(o.sale), entra: redondear(o.entra), vencido: redondear(o.vencido), textos: { sale: fmtMoneda(o.sale), entra: fmtMoneda(o.entra), vencido: fmtMoneda(o.vencido) } })).filter((o) => o.sale || o.entra || o.vencido),
    nota: "El saldo de hoy de cada cuenta solo es real si está confirmado por su extracto. Los pagos con un medio que no es una cuenta registrada (tarjeta, efectivo, otra empresa) van aparte.",
  };
}
export { masDias };
