import { prisma } from "@/lib/prisma";
import { hoyColombia } from "@/lib/hoyColombia";
import { mapasCatalogos, claveNombre } from "@/lib/tesoreria/maestros";
import { reporteSaldos } from "@/lib/tesoreria/saldos";
import { fmtMoneda, redondear, esIngreso, esEgreso, TIPOS_PAGO } from "@/lib/tesoreria/comun";
import { masDias } from "@/lib/tesoreria/periodos";

// Consultas de Tesorería para preguntas de un gerente («¿qué tengo que pagar esta semana?», «¿ya se pagó el gas?»,
// «¿cuánto ha salido de AV Villas este año?», «dame el soporte del pago X»). Las usan Nova (novaTesoreria.js) y las
// notificaciones (notificacionesConsultas.js). Solo leen; las cifras salen calculadas y con su moneda ISO 4217.

const num = (d) => (d == null ? 0 : Number(d));
const palabras = (s) => claveNombre(s).split(" ").filter((w) => w.length >= 3);
const sale = (p) => esEgreso(p) || (p.tipo === "T" && num(p.valor) < 0);
const entra = (p) => esIngreso(p) || (p.tipo === "T" && num(p.valor) > 0);
export const urlSoporte = (id) => `/api/tesoreria/soportes/${id}`;

async function idsPorNombre(lista, texto) {
  if (!texto) return null;
  const t = claveNombre(texto);
  const exactos = lista.filter((x) => claveNombre(x.nombre) === t);
  return (exactos.length ? exactos : lista.filter((x) => claveNombre(x.nombre).includes(t) || t.includes(claveNombre(x.nombre)))).map((x) => x.id);
}

// Coincide con todas las palabras del texto (concepto, ítem, observación, medio, quién paga).
function coincideTexto(p, mapas, texto) {
  if (!texto) return true;
  const hay = claveNombre([mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto, p.itemId ? mapas.items.get(p.itemId)?.nombre : "", p.observacion, p.medioPagoId ? mapas.medios.get(p.medioPagoId)?.nombre : "", p.pagadorId ? mapas.pagadores.get(p.pagadorId)?.nombre : ""].join(" "));
  return palabras(texto).every((w) => hay.includes(w));
}

function filaPago(p, mapas, hoy) {
  const asignado = (p.asociaciones || []).reduce((s, a) => s + num(a.valor), 0);
  return {
    id: p.id, vence: p.fecha, estado: p.estado === "E" ? "E · pagado" : p.fecha < hoy ? `P · vencido hace ${Math.round((Date.parse(hoy) - Date.parse(p.fecha)) / 86400000)} día(s)` : "P · pendiente",
    tipo: `${p.tipo} · ${TIPOS_PAGO[p.tipo]}`, concepto: mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto, item: p.itemId ? mapas.items.get(p.itemId)?.nombre || null : null,
    medioPago: p.medioPagoId ? mapas.medios.get(p.medioPagoId)?.nombre || null : null, paga: p.pagadorId ? mapas.pagadores.get(p.pagadorId)?.nombre || null : null,
    valor: fmtMoneda(p.valor, p.moneda), conMovimiento: (p.asociaciones || []).length > 0, asociado: asignado ? fmtMoneda(asignado, p.moneda) : null,
    periodico: !!p.gastoPeriodicoId, observacion: p.observacion || null,
    ...(p.estado === "E" ? { pagadoEl: (p.asociaciones || []).map((a) => a.movimiento?.fecha).filter(Boolean).sort()[0] || "sin movimiento del banco (marcado a mano)" } : {}),
  };
}

// Pagos programados con vencimiento en un rango. estado: pendientes | pagados | todos. sentido: egresos | ingresos | todos.
// segun: vencimiento (por defecto) | pago — «¿qué se pagó la semana pasada?» va por el día en que se pagó: la fecha del
// movimiento del banco asociado (si no tiene movimiento, se toma su vencimiento).
export async function agendaPagos({ desde, hasta, estado = "todos", sentido = "todos", texto = null, item = null, medio = null, limite = 40, segun = null } = {}) {
  const hoy = hoyColombia();
  const mapas = await mapasCatalogos();
  segun ||= estado === "pagados" ? "pago" : "vencimiento";
  const where = { NOT: { valor: 0 }, tipo: { in: ["I", "E", "J", "T"] } };
  if (segun === "pago") {
    where.estado = "E";
    where.OR = [{ asociaciones: { some: { movimiento: { fecha: { gte: desde, lte: hasta } } } } }, { asociaciones: { none: {} }, fecha: { gte: desde, lte: hasta } }];
  } else where.fecha = { gte: desde, lte: hasta };
  if (estado === "pendientes") where.estado = "P";
  if (estado === "pagados") where.estado = "E";
  const items = item ? await idsPorNombre([...mapas.items.values()], item) : null;
  const medios = medio ? await idsPorNombre([...mapas.medios.values()], medio) : null;
  if (items) where.itemId = { in: items.length ? items : [-1] };
  if (medios) where.medioPagoId = { in: medios.length ? medios : [-1] };
  let pagos = await prisma.pagoProgramado.findMany({ where, include: { asociaciones: { select: { valor: true, movimiento: { select: { fecha: true, bancoId: true } } } } }, orderBy: [{ fecha: "asc" }, { id: "asc" }] });
  pagos = pagos.filter((p) => coincideTexto(p, mapas, texto) && (sentido === "egresos" ? sale(p) : sentido === "ingresos" ? entra(p) : true));
  const suma = (l) => redondear(l.reduce((s, p) => s + Math.abs(num(p.valor)), 0));
  const P = pagos.filter((p) => p.estado === "P");
  const E = pagos.filter((p) => p.estado === "E");
  return {
    desde, hasta, hoy, segun: segun === "pago" ? "fecha en que se pagó (movimiento del banco)" : "fecha de vencimiento", cantidad: pagos.length,
    totales: {
      porPagar: fmtMoneda(suma(P.filter(sale))), porRecibir: fmtMoneda(suma(P.filter(entra))),
      pagado: fmtMoneda(suma(E.filter(sale))), recibido: fmtMoneda(suma(E.filter(entra))),
      pendientes: P.length, pagados: E.length,
      vencidos: P.filter((p) => p.fecha < hoy).length, porPagarVencido: fmtMoneda(suma(P.filter((p) => p.fecha < hoy && sale(p)))), porRecibirVencido: fmtMoneda(suma(P.filter((p) => p.fecha < hoy && entra(p)))),
      porVencer: P.filter((p) => p.fecha >= hoy).length, porPagarPorVencer: fmtMoneda(suma(P.filter((p) => p.fecha >= hoy && sale(p)))), porRecibirPorVencer: fmtMoneda(suma(P.filter((p) => p.fecha >= hoy && entra(p)))),
      _porPagar: suma(P.filter(sale)), _porRecibir: suma(P.filter(entra)),
    },
    pagos: pagos.slice(0, limite).map((p) => filaPago(p, mapas, hoy)),
    _pagos: pagos,
    nota: pagos.length > limite ? `Se muestran ${limite} de ${pagos.length}; para el resto, acota el período o el texto.` : null,
  };
}

// «¿Ya se pagó X?»: los pagos que coinciden con el texto alrededor de hoy (o en el rango dado), con su estado, el
// movimiento del banco que lo pagó y sus soportes. Si no hay pago programado, busca movimientos del banco parecidos.
export async function estadoDePago({ texto, desde = null, hasta = null, limite = 8 } = {}) {
  const hoy = hoyColombia();
  desde ||= masDias(hoy, -120);
  hasta ||= masDias(hoy, 45);
  const mapas = await mapasCatalogos();
  const pagos = (await prisma.pagoProgramado.findMany({
    where: { fecha: { gte: desde, lte: hasta }, NOT: { valor: 0 } },
    include: { asociaciones: { include: { movimiento: { include: { soportes: { select: { id: true, nombre: true } } } } } } },
  })).filter((p) => coincideTexto(p, mapas, texto));
  pagos.sort((a, b) => Math.abs(Date.parse(a.fecha) - Date.parse(hoy)) - Math.abs(Date.parse(b.fecha) - Date.parse(hoy)));
  const out = pagos.slice(0, limite).map((p) => ({
    ...filaPago(p, mapas, hoy),
    pagadoCon: p.asociaciones.map((a) => ({
      movimientoId: a.movimiento.id, fecha: a.movimiento.fecha, banco: mapas.bancos.get(a.movimiento.bancoId)?.nombre, descripcion: a.movimiento.descripcion,
      valor: fmtMoneda(a.valor, a.movimiento.moneda), soportes: a.movimiento.soportes.map((s) => ({ nombre: s.nombre, enlace: urlSoporte(s.id) })),
    })),
  }));
  let movimientosParecidos = [];
  if (!out.length && texto) {
    const t = palabras(texto);
    const movs = await prisma.movimientoBanco.findMany({ where: { fecha: { gte: desde, lte: hoy } }, orderBy: { fecha: "desc" }, take: 3000, include: { soportes: { select: { id: true, nombre: true } } } });
    movimientosParecidos = movs.filter((m) => { const h = claveNombre(`${m.descripcion} ${m.concepto || ""} ${m.tercero || ""} ${m.observacion || ""}`); return t.every((w) => h.includes(w)); }).slice(0, limite)
      .map((m) => ({ id: m.id, fecha: m.fecha, banco: mapas.bancos.get(m.bancoId)?.nombre, tipo: m.tipo === "debito" ? "salió" : "entró", descripcion: m.descripcion, concepto: m.concepto, valor: fmtMoneda(m.valor, m.moneda), soportes: m.soportes.map((s) => ({ nombre: s.nombre, enlace: urlSoporte(s.id) })) }));
  }
  return { texto, buscadoEntre: `${desde} y ${hasta}`, hoy, encontrados: pagos.length, pagos: out, movimientosParecidos };
}

// Si el saldo de un banco está confirmado por un extracto y desde cuándo es estimado (último saldo del banco ±
// movimientos registrados). Un mes cerrado sin extracto = saldo no confirmado.
function confirmacionSaldo(b, hasta) {
  const ult = b.ultimoSaldoBanco?.dia || null;
  const mesAnteriorFin = (() => { const [a, m] = hasta.split("-").map(Number); return new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10); })();
  const confirmado = !!ult && ult >= mesAnteriorFin;
  return {
    ultimoExtracto: ult,
    confirmado,
    aviso: !ult
      ? `No hay ningún extracto de ${b.banco}: el saldo es solo una estimación (saldo inicial ± movimientos registrados) y no se puede confirmar.`
      : confirmado
        ? `Confirmado con el extracto hasta el ${ult}${ult < hasta ? `; de ahí al ${hasta} se suma y resta lo registrado (estimado hasta subir el siguiente extracto)` : ""}.`
        : `No se puede conocer el saldo real de ${b.banco}: falta el extracto desde el ${masDias(ult, 1)}. Lo que se muestra es una estimación: el saldo del extracto del ${ult} más y menos los movimientos registrados después.`,
  };
}

// Reporte de un banco en un rango: cuánto salió y entró, por mes, en qué se fue (por concepto/descripción), los
// movimientos más grandes y el saldo al inicio y al final, diciendo si está confirmado por extracto o es estimado.
export async function reporteBanco({ banco, desde, hasta, limite = 10 } = {}) {
  const mapas = await mapasCatalogos();
  const bancos = [...mapas.bancos.values()];
  const ids = await idsPorNombre(bancos, banco);
  if (!ids?.length) return { error: `No encontré el banco «${banco}».`, bancosDisponibles: bancos.map((b) => b.nombre) };
  const b = bancos.find((x) => x.id === ids[0]);
  const movs = await prisma.movimientoBanco.findMany({ where: { bancoId: b.id, fecha: { gte: desde, lte: hasta } }, orderBy: { fecha: "asc" } });
  const salidas = movs.filter((m) => m.tipo === "debito");
  const entradas = movs.filter((m) => m.tipo === "credito");
  const suma = (l) => redondear(l.reduce((s, m) => s + num(m.valor), 0));
  const porMes = new Map();
  for (const m of movs) {
    const k = m.fecha.slice(0, 7);
    const x = porMes.get(k) || { mes: k, salio: 0, entro: 0, movimientos: 0 };
    if (m.tipo === "debito") x.salio += num(m.valor); else x.entro += num(m.valor);
    x.movimientos++;
    porMes.set(k, x);
  }
  const grupos = new Map();
  for (const m of salidas) {
    const k = m.concepto || m.descripcion.replace(/\d{5,}/g, "").trim();
    const g = grupos.get(k) || { en: k, total: 0, veces: 0 };
    g.total += num(m.valor); g.veces++;
    grupos.set(k, g);
  }
  const anioFin = Number(hasta.slice(0, 4));
  const antes = masDias(desde, -1);
  const rep = await reporteSaldos(anioFin, { bancoId: b.id, dias: [antes, hasta] });
  let saldoInicio = rep.items[0]?.saldosEn?.[antes] ?? null;
  if (Number(antes.slice(0, 4)) !== anioFin) saldoInicio = (await reporteSaldos(Number(antes.slice(0, 4)), { bancoId: b.id, dias: [antes] })).items[0]?.saldosEn?.[antes] ?? null;
  const saldoFin = rep.items[0]?.saldosEn?.[hasta] ?? null;
  const conf = confirmacionSaldo({ ...rep.items[0], banco: b.nombre }, hasta);
  // Meses del período en que lo registrado no dio lo mismo que el extracto (diferencia de conciliación).
  const noCuadran = (rep.items[0]?.meses || []).filter((m) => m.diferencia != null && Math.abs(m.diferencia) > 0.5 && `${anioFin}-${String(m.mes).padStart(2, "0")}` >= desde.slice(0, 7) && `${anioFin}-${String(m.mes).padStart(2, "0")}` <= hasta.slice(0, 7)).map((m) => ({ mes: `${anioFin}-${String(m.mes).padStart(2, "0")}`, loRegistradoDaba: fmtMoneda(m.calculado, b.moneda), elBancoDijo: fmtMoneda(m.reportado, b.moneda), diferencia: fmtMoneda(m.diferencia, b.moneda) }));
  return {
    banco: b.nombre, moneda: b.moneda, desde, hasta,
    salio: fmtMoneda(suma(salidas), b.moneda), entro: fmtMoneda(suma(entradas), b.moneda), neto: fmtMoneda(suma(entradas) - suma(salidas), b.moneda),
    movimientos: movs.length, salidas: salidas.length, entradas: entradas.length,
    saldoAlEmpezar: saldoInicio == null ? "no se puede calcular (falta saldo inicial o extracto)" : fmtMoneda(saldoInicio, b.moneda),
    saldoAlTerminar: saldoFin == null ? "no se puede calcular (falta saldo inicial o extracto)" : fmtMoneda(saldoFin, b.moneda),
    saldoConfirmado: conf.confirmado, ultimoExtracto: conf.ultimoExtracto, avisoSaldo: conf.aviso,
    mesesQueNoCuadranConElExtracto: noCuadran,
    ...(noCuadran.length ? { avisoConciliacion: `En ${noCuadran.map((x) => x.mes).join(", ")} lo registrado no da lo mismo que el extracto: hay movimientos que faltan o sobran (ver Conciliación). Las cifras de salidas y entradas son las registradas.` } : {}),
    porMes: [...porMes.values()].map((x) => ({ mes: x.mes, salio: fmtMoneda(x.salio, b.moneda), entro: fmtMoneda(x.entro, b.moneda), movimientos: x.movimientos })),
    enQueSeFue: [...grupos.values()].sort((a, c) => c.total - a.total).slice(0, limite).map((g) => ({ en: g.en, total: fmtMoneda(g.total, b.moneda), veces: g.veces })),
    mayoresSalidas: [...salidas].sort((a, c) => num(c.valor) - num(a.valor)).slice(0, 5).map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, concepto: m.concepto, valor: fmtMoneda(m.valor, m.moneda) })),
    mayoresEntradas: [...entradas].sort((a, c) => num(c.valor) - num(a.valor)).slice(0, 5).map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, concepto: m.concepto, valor: fmtMoneda(m.valor, m.moneda) })),
  };
}

// Saldos de todos los bancos a hoy, diciendo cuáles están confirmados por extracto y cuáles son estimados.
export async function saldosConEstado() {
  const hoy = hoyColombia();
  const rep = await reporteSaldos(Number(hoy.slice(0, 4)));
  const bancos = rep.items.filter((b) => b.activo).map((b) => {
    const c = confirmacionSaldo(b, hoy);
    return { banco: b.banco, moneda: b.moneda, saldoHoy: b.saldoHoy == null ? "no se puede calcular (falta saldo inicial o extracto)" : fmtMoneda(b.saldoHoy, b.moneda), _saldo: b.saldoHoy, confirmado: c.confirmado, ultimoExtracto: c.ultimoExtracto, aviso: c.aviso };
  });
  const conSaldo = bancos.filter((b) => b._saldo != null);
  const todosConfirmados = bancos.every((b) => b.confirmado);
  return {
    hoy,
    bancos: bancos.map(({ _saldo, ...b }) => b),
    totalEnBancos: conSaldo.length ? fmtMoneda(conSaldo.reduce((s, b) => s + b._saldo, 0), "COP") : "no se puede calcular",
    totalConfirmado: todosConfirmados,
    avisoTotal: todosConfirmados ? "Todos los bancos están confirmados con su último extracto." : `El total NO está confirmado: ${bancos.filter((b) => !b.confirmado).map((b) => b.banco).join(", ")} no tiene(n) el extracto del último mes. Es una estimación (saldo inicial ± movimientos registrados).`,
  };
}

// Soportes del pago (los de los movimientos del banco asociados a él).
export async function soportesDePago({ pagoId = null, texto = null } = {}) {
  let pago = null;
  if (pagoId) pago = await prisma.pagoProgramado.findUnique({ where: { id: Number(pagoId) || 0 } });
  if (!pago && texto) {
    const r = await estadoDePago({ texto, limite: 5 });
    const conSoporte = r.pagos.find((p) => p.pagadoCon.some((m) => m.soportes.length)) || r.pagos[0];
    if (!conSoporte) return { encontrado: false, texto, movimientosParecidos: r.movimientosParecidos, nota: r.movimientosParecidos.some((m) => m.soportes.length) ? "No hay pago programado con ese texto, pero sí movimientos del banco con soporte." : "No encontré un pago ni un movimiento con ese texto." };
    pago = await prisma.pagoProgramado.findUnique({ where: { id: conSoporte.id } });
  }
  if (!pago) return { encontrado: false, nota: "Indica el pago (su concepto o su número)." };
  const mapas = await mapasCatalogos();
  const asoc = await prisma.asociacionPago.findMany({ where: { pagoId: pago.id }, include: { movimiento: { include: { soportes: { select: { id: true, nombre: true, tipoMime: true, createdAt: true } } } } } });
  const soportes = asoc.flatMap((a) => a.movimiento.soportes.map((s) => ({ nombre: s.nombre, tipo: s.tipoMime, enlace: urlSoporte(s.id), movimiento: `${a.movimiento.fecha} · ${a.movimiento.descripcion} · ${fmtMoneda(a.movimiento.valor, a.movimiento.moneda)}` })));
  return {
    encontrado: true, pago: filaPago({ ...pago, asociaciones: asoc }, mapas, hoyColombia()), soportes,
    nota: soportes.length ? "Entrega cada soporte como enlace en Markdown: [nombre](enlace)." : asoc.length ? "El pago tiene movimiento del banco, pero a ese movimiento no se le ha subido soporte." : pago.estado === "E" ? "El pago está en E (pagado) pero sin movimiento del banco asociado, así que no tiene soporte." : "El pago sigue pendiente (P): aún no tiene movimiento ni soporte.",
  };
}

// Movimientos del banco registrados (por fecha de creación en el sistema) en un rango, para notificaciones.
export async function movimientosRegistrados({ desde, hasta, banco = null, sentido = "todos" } = {}) {
  const mapas = await mapasCatalogos();
  const ids = banco ? await idsPorNombre([...mapas.bancos.values()], banco) : null;
  const where = { createdAt: { gte: new Date(`${desde}T05:00:00Z`), lt: new Date(`${masDias(hasta, 1)}T05:00:00Z`) } };
  if (ids) where.bancoId = { in: ids.length ? ids : [-1] };
  if (sentido === "egresos") where.tipo = "debito";
  if (sentido === "ingresos") where.tipo = "credito";
  const movs = await prisma.movimientoBanco.findMany({ where, orderBy: { fecha: "desc" }, take: 500 });
  return movs.map((m) => ({ ...m, banco: mapas.bancos.get(m.bancoId)?.nombre }));
}
