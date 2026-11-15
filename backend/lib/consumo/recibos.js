import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { logConsumo } from "@/lib/audit";
import { coincide } from "@/lib/buscarTexto";
import { prepararArchivo } from "@/lib/agenteCotizador";
import { crearMaestro } from "@/lib/consumo/maestros";
import { badRequest, notFound, limpiar, numero, fechaValida, monedaValida, fmtMoneda, claveNumero, SERVICIOS } from "@/lib/consumo/comun";

// Recibos de servicios públicos: uno por cuenta y período facturado. Guarda lo que trae el recibo; lo que el Excel del
// contador calcula con fórmulas (consumo y costo por día, variaciones, costo efectivo) se calcula al leer y no se guarda.
// La sede de un recibo siempre la escoge o la confirma una persona (cuentaId, o `cuenta` con la sede elegida).

export const TIPOS_LECTURA = { real: "Real", promediada: "Promediada", estimada: "Estimada", sin_consumo: "Sin consumo" };
export const ESTADOS_PAGO = { pendiente: "Por pagar", pagado: "Pagado", saldo_favor: "Saldo a favor" };
export const GRUPOS_CARGO = { energia: "Energía", acueducto: "Acueducto", alcantarillado: "Alcantarillado", gas: "Gas", aseo: "Aseo", otros: "Otros cobros", financiado: "Financiado" };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const quien = (actor) => ({ creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null });
const n = (v) => (v == null ? null : Number(v));
const r2 = (v) => Math.round(v * 100) / 100;
const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
const fechaCorta = (f) => (f ? `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1].toLowerCase()} ${f.slice(0, 4)}` : null);
const periodoTexto = (r) => `${fechaCorta(r.periodoDesde)} – ${fechaCorta(r.periodoHasta)}`;

const incluir = { cuenta: { include: { sede: true, empresa: { select: { id: true, nombre: true } } } }, medidor: { select: { id: true, numero: true } }, cargos: { orderBy: [{ orden: "asc" }, { id: "asc" }] }, soportes: { select: { id: true, nombre: true, tipoMime: true, tamano: true, createdAt: true, creadoPorNombre: true }, orderBy: { id: "asc" } } };

// ---------- Lectura: recibo plano + lo calculado ----------

// El aseo llega dentro del recibo de energía: se muestra, pero no cuenta en el costo del servicio.
function costoServicio(r) {
  const aseo = r.servicio === "aseo" ? 0 : r.cargos.filter((c) => c.grupo === "aseo").reduce((s, c) => s + c.valor, 0);
  return r2(r.totalCargos - aseo);
}

function aPlano(x) {
  const r = {
    id: x.id, cuentaId: x.cuentaId, medidorId: x.medidorId, medidor: x.medidor?.numero || null,
    sedeId: x.cuenta.sedeId, sede: x.cuenta.sede.nombre, edificio: x.cuenta.sede.edificio, servicio: x.cuenta.servicio,
    empresaId: x.cuenta.empresaId, empresa: x.cuenta.empresa?.nombre || null, numeroCuenta: x.cuenta.numeroCuenta, titular: x.cuenta.titular,
    numeroFactura: x.numeroFactura, periodoDesde: x.periodoDesde, periodoHasta: x.periodoHasta, dias: x.dias, anio: x.anio, mes: x.mes,
    tipoLectura: x.tipoLectura, lecturaAnterior: n(x.lecturaAnterior), lecturaActual: n(x.lecturaActual), factor: n(x.factor), consumo: n(x.consumo), unidad: x.unidad,
    vigenciaTarifa: x.vigenciaTarifa, valorUnitario: n(x.valorUnitario), totalCargos: n(x.totalCargos), saldoAnterior: n(x.saldoAnterior), totalPagar: n(x.totalPagar), moneda: x.moneda,
    fechaExpedicion: x.fechaExpedicion, fechaPagoOportuno: x.fechaPagoOportuno, fechaSuspension: x.fechaSuspension,
    estadoPago: x.estadoPago, valorPagado: n(x.valorPagado), fechaPago: x.fechaPago, origen: x.origen, nota: x.nota,
    createdAt: x.createdAt, creadoPorNombre: x.creadoPorNombre, updatedAt: x.updatedAt,
    cargos: (x.cargos || []).map((c) => ({ id: c.id, grupo: c.grupo, concepto: c.concepto, cantidad: n(c.cantidad), valorUnitario: n(c.valorUnitario), valor: n(c.valor) })),
    soportes: x.soportes || [],
  };
  r.periodo = periodoTexto(r);
  r.mesTexto = `${MESES[r.mes - 1]} ${r.anio}`;
  r.costoServicio = costoServicio(r);
  r.valorAseo = r2(r.totalCargos - r.costoServicio);
  r.consumoDia = r.consumo != null && r.dias ? r.consumo / r.dias : null;
  r.costoDia = r.dias ? r.costoServicio / r.dias : null;
  r.costoUnidad = r.consumo ? r.costoServicio / r.consumo : null;
  r.vencido = r.estadoPago === "pendiente" && !!r.fechaPagoOportuno && r.fechaPagoOportuno < hoyCO();
  r.saldo = r.estadoPago === "pendiente" ? r.totalPagar : 0;
  return r;
}

const variacion = (a, b) => (a != null && b ? a / b - 1 : null);

// Todos los recibos con sus variaciones frente al período anterior de la misma sede y servicio (aunque haya cambiado de
// cuenta o de medidor, como en el Excel del contador). Orden: lo más reciente primero.
export async function todosLosRecibos() {
  return todos();
}
async function todos() {
  const filas = (await prisma.reciboConsumo.findMany({ include: incluir })).map(aPlano);
  const grupos = new Map();
  for (const r of filas) { const k = `${r.sedeId}|${r.servicio}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.periodoHasta.localeCompare(b.periodoHasta) || a.id - b.id);
    lista.forEach((r, i) => {
      const p = i ? lista[i - 1] : null;
      r.anteriorId = p?.id || null;
      r.varConsumo = p ? variacion(r.consumo, p.consumo) : null;
      r.varUnitario = p ? variacion(r.valorUnitario, p.valorUnitario) : null;
      r.varTotal = p ? variacion(r.costoServicio, p.costoServicio) : null;
      r.varConsumoDia = p ? variacion(r.consumoDia, p.consumoDia) : null;
    });
  }
  return filas.sort((a, b) => b.periodoHasta.localeCompare(a.periodoHasta) || b.id - a.id);
}

export async function listarRecibos({ q, sedeId, servicio, anio, pago, lectura, page = 1, size = 25 } = {}) {
  const base = (await todos()).filter((r) =>
    (!sedeId || r.sedeId === Number(sedeId))
    && (!anio || r.anio === Number(anio))
    && (!pago || (pago === "vencido" ? r.vencido : pago === "pendiente" ? r.estadoPago === "pendiente" : r.estadoPago === pago))
    && (!lectura || (lectura === "no_real" ? r.tipoLectura === "promediada" || r.tipoLectura === "estimada" : r.tipoLectura === lectura))
    && coincide(q, r.sede, r.edificio, r.numeroCuenta, r.numeroFactura, r.medidor, r.empresa, r.titular));
  // Las pestañas de servicio cuentan sobre los demás filtros, antes de aplicar el del servicio.
  const porServicio = Object.fromEntries(Object.keys(SERVICIOS).map((s) => [s, base.filter((r) => r.servicio === s).length]));
  const filtrados = servicio ? base.filter((r) => r.servicio === servicio) : base;
  const suma = (f) => r2(filtrados.reduce((s, r) => s + (f(r) || 0), 0));
  const consumos = {};
  for (const r of filtrados) if (r.consumo != null && SERVICIOS[r.servicio]?.unidad) consumos[r.servicio] = (consumos[r.servicio] || 0) + r.consumo;
  const tam = Math.min(Math.max(Number(size) || 25, 1), 200);
  const paginas = Math.max(1, Math.ceil(filtrados.length / tam));
  const pag = Math.min(Math.max(Number(page) || 1, 1), paginas);
  return {
    items: filtrados.slice((pag - 1) * tam, pag * tam).map(({ cargos, soportes, ...r }) => ({ ...r, soportes: soportes.length })),
    total: filtrados.length, page: pag, size: tam, porServicio, todosLosServicios: base.length,
    totales: { totalCargos: suma((r) => r.totalCargos), pagado: suma((r) => r.valorPagado), saldo: suma((r) => r.saldo), vencidos: filtrados.filter((r) => r.vencido).length, consumos },
    anios: [...new Set((await prisma.reciboConsumo.findMany({ select: { anio: true }, distinct: ["anio"] })).map((x) => x.anio))].sort((a, b) => b - a),
  };
}

export async function obtenerRecibo(id) {
  const r = (await todos()).find((x) => x.id === (Number(id) || 0));
  if (!r) throw notFound("El recibo no existe.");
  const crudo = await prisma.reciboConsumo.findUnique({ where: { id: r.id }, select: { extras: true } });
  let extras = null;
  try { extras = crudo.extras ? JSON.parse(crudo.extras) : null; } catch { extras = null; }
  const historial = (await prisma.historialReciboConsumo.findMany({ where: { reciboId: r.id }, orderBy: [{ anio: "asc" }, { mes: "asc" }] })).map((h) => ({ anio: h.anio, mes: h.mes, etiqueta: h.etiqueta, consumo: Number(h.consumo) }));
  return { ...r, extras, historial };
}

// ---------- Escritura ----------

const opc = (v, campo) => (v === undefined || v === null || v === "" ? null : numero(v, campo));
const fechaOpc = (v, campo) => (v ? fechaValida(v, campo) : null);

// La cuenta del recibo: una que ya existe (cuentaId) o una nueva en la sede que la persona eligió (`cuenta`).
async function resolverCuenta(actor, body) {
  if (body.cuentaId) {
    const c = await prisma.cuentaConsumo.findUnique({ where: { id: Number(body.cuentaId) || 0 }, include: { medidores: true } });
    if (!c || c.noAplica) throw badRequest("La cuenta de servicio no existe.");
    return c;
  }
  const nueva = body.cuenta;
  if (!nueva?.sedeId) throw badRequest("Elige la sede del recibo.");
  const creada = await crearMaestro(actor, "cuenta", { ...nueva, noAplica: false, medidores: nueva.medidor ? [{ numero: nueva.medidor }] : [] });
  return prisma.cuentaConsumo.findUnique({ where: { id: creada.id }, include: { medidores: true } });
}

// El medidor del recibo: por id, por número (se crea en la cuenta si no estaba) o ninguno.
async function resolverMedidor(actor, cuenta, body) {
  if (body.medidorId) {
    const m = cuenta.medidores.find((x) => x.id === Number(body.medidorId));
    if (!m) throw badRequest("Ese medidor no es de la cuenta.");
    return m.id;
  }
  const num = limpiar(body.medidor, 40);
  if (!num) return cuenta.medidores.length === 1 ? cuenta.medidores[0].id : null;
  const ya = cuenta.medidores.find((x) => claveNumero(x.numero) === claveNumero(num));
  if (ya) return ya.id;
  return (await prisma.medidorConsumo.create({ data: { cuentaId: cuenta.id, numero: num, ...quien(actor) } })).id;
}

function cargosDe(lista) {
  if (!Array.isArray(lista)) return null;
  return lista.filter((c) => c && (limpiar(c.concepto, 200) || c.valor)).map((c, i) => {
    const concepto = limpiar(c.concepto, 200);
    if (!concepto) throw badRequest("Cada cargo necesita su concepto.");
    if (!GRUPOS_CARGO[c.grupo]) throw badRequest(`El cargo «${concepto}» no tiene un grupo válido.`);
    return { grupo: c.grupo, concepto, cantidad: opc(c.cantidad, `La cantidad de «${concepto}»`), valorUnitario: opc(c.valorUnitario, `El valor unitario de «${concepto}»`), valor: r2(numero(c.valor, `El valor de «${concepto}»`)), orden: i };
  });
}

async function datosRecibo(body, cuenta, actual) {
  const servicio = SERVICIOS[cuenta.servicio];
  const d = {};
  const toma = (k) => body[k] !== undefined || !actual;
  const final = (k) => (d[k] !== undefined ? d[k] : actual ? (actual[k] != null && typeof actual[k] === "object" ? Number(actual[k]) : actual[k]) : undefined);

  if (toma("periodoDesde")) d.periodoDesde = fechaValida(body.periodoDesde, "El inicio del período");
  if (toma("periodoHasta")) d.periodoHasta = fechaValida(body.periodoHasta, "El fin del período");
  const [desde, hasta] = [final("periodoDesde"), final("periodoHasta")];
  if (hasta < desde) throw badRequest("El período termina antes de empezar: revisa las fechas.");
  if (diasEntre(desde, hasta) > 200) throw badRequest("El período pasa de 200 días: revisa las fechas.");
  if (body.dias !== undefined || d.periodoDesde || d.periodoHasta) {
    d.dias = body.dias ? Math.round(numero(body.dias, "Los días facturados")) : diasEntre(desde, hasta);
    if (d.dias < 1 || d.dias > 200) throw badRequest("Los días facturados no cuadran.");
  }
  if (body.anio !== undefined || body.mes !== undefined || d.periodoHasta) {
    d.anio = body.anio ? Number(body.anio) : Number(hasta.slice(0, 4));
    d.mes = body.mes ? Number(body.mes) : Number(hasta.slice(5, 7));
    if (!(d.anio >= 2000 && d.anio <= 2100) || !(d.mes >= 1 && d.mes <= 12)) throw badRequest("El mes de reporte no es válido.");
  }
  if (body.numeroFactura !== undefined) d.numeroFactura = limpiar(body.numeroFactura, 60);
  if (body.tipoLectura !== undefined) {
    if (!TIPOS_LECTURA[body.tipoLectura]) throw badRequest("El tipo de lectura no es válido.");
    d.tipoLectura = body.tipoLectura;
  }
  if (body.lecturaAnterior !== undefined) d.lecturaAnterior = opc(body.lecturaAnterior, "La lectura anterior");
  if (body.lecturaActual !== undefined) d.lecturaActual = opc(body.lecturaActual, "La lectura actual");
  if (body.factor !== undefined) { d.factor = body.factor === "" || body.factor === null ? 1 : numero(body.factor, "El factor"); if (!(d.factor > 0)) throw badRequest("El factor debe ser mayor que cero."); }
  if (body.consumo !== undefined) d.consumo = opc(body.consumo, "El consumo");
  // Sin consumo digitado: lectura actual − anterior, por el factor.
  const [la, lc] = [final("lecturaAnterior"), final("lecturaActual")];
  if ((body.consumo === undefined || d.consumo === null) && la != null && lc != null && (d.lecturaAnterior !== undefined || d.lecturaActual !== undefined || !actual)) d.consumo = (lc - la) * (final("factor") || 1);
  if (final("consumo") != null && final("consumo") < 0) throw badRequest("El consumo no puede ser negativo: revisa las lecturas.");
  if (!actual) d.unidad = servicio.unidad || "";
  if (body.vigenciaTarifa !== undefined) d.vigenciaTarifa = limpiar(body.vigenciaTarifa, 40);
  if (body.valorUnitario !== undefined) d.valorUnitario = opc(body.valorUnitario, "El valor unitario");
  if (body.moneda !== undefined || !actual) d.moneda = monedaValida(body.moneda);
  for (const k of ["fechaExpedicion", "fechaPagoOportuno", "fechaSuspension"]) if (body[k] !== undefined) d[k] = fechaOpc(body[k], "La fecha");
  if (body.nota !== undefined) d.nota = limpiar(body.nota, 1000);
  if (body.extras !== undefined) d.extras = body.extras ? JSON.stringify(body.extras).replace(/�/g, "") : null;

  const cargos = cargosDe(body.cargos);
  if (cargos?.length) d.totalCargos = r2(cargos.reduce((s, c) => s + c.valor, 0));
  else if (toma("totalCargos")) d.totalCargos = r2(numero(body.totalCargos, "El total de cargos del período"));
  if (body.saldoAnterior !== undefined) d.saldoAnterior = r2(opc(body.saldoAnterior, "El saldo anterior") || 0);
  if (body.totalPagar !== undefined && body.totalPagar !== "" && body.totalPagar !== null) d.totalPagar = r2(numero(body.totalPagar, "El total a pagar"));
  else if (!actual || d.totalCargos !== undefined || d.saldoAnterior !== undefined) d.totalPagar = r2(final("totalCargos") + (final("saldoAnterior") || 0));
  return { d, cargos };
}

// No se carga dos veces el mismo recibo: misma factura o mismo período en la cuenta.
async function exigirNoDuplicado(cuentaId, d, excluirId) {
  const otros = await prisma.reciboConsumo.findMany({ where: { cuentaId, ...(excluirId ? { id: { not: excluirId } } : {}) }, select: { id: true, numeroFactura: true, periodoDesde: true, periodoHasta: true } });
  const porFactura = d.numeroFactura && otros.find((o) => o.numeroFactura && claveNumero(o.numeroFactura) === claveNumero(d.numeroFactura));
  if (porFactura) throw Object.assign(badRequest(`La factura ${porFactura.numeroFactura} ya está cargada en esta cuenta.`), { duplicadoId: porFactura.id });
  const porPeriodo = otros.find((o) => o.periodoDesde === d.periodoDesde && o.periodoHasta === d.periodoHasta);
  if (porPeriodo) throw Object.assign(badRequest("Esta cuenta ya tiene un recibo de ese mismo período."), { duplicadoId: porPeriodo.id });
}

const paraAuditoria = (r) => r && {
  sede: r.sede, servicio: SERVICIOS[r.servicio]?.nombre, cuenta: r.numeroCuenta, medidor: r.medidor, numeroFactura: r.numeroFactura,
  periodo: r.periodo, dias: r.dias, mesReporte: r.mesTexto, tipoLectura: TIPOS_LECTURA[r.tipoLectura], lecturaAnterior: r.lecturaAnterior, lecturaActual: r.lecturaActual,
  factor: r.factor, consumo: r.consumo != null ? `${r.consumo} ${r.unidad}`.trim() : null, vigenciaTarifa: r.vigenciaTarifa, valorUnitario: r.valorUnitario,
  totalCargos: fmtMoneda(r.totalCargos, r.moneda), saldoAnterior: fmtMoneda(r.saldoAnterior, r.moneda), totalPagar: fmtMoneda(r.totalPagar, r.moneda),
  fechaExpedicion: r.fechaExpedicion, fechaPagoOportuno: r.fechaPagoOportuno, fechaSuspension: r.fechaSuspension,
  estadoPago: ESTADOS_PAGO[r.estadoPago], valorPagado: r.valorPagado != null ? fmtMoneda(r.valorPagado, r.moneda) : null, fechaPago: r.fechaPago, origen: r.origen === "nova" ? "Leído por Nova" : "A mano", nota: r.nota,
  cargos: r.cargos.map((c) => `${GRUPOS_CARGO[c.grupo]}: ${c.concepto} ${fmtMoneda(c.valor, r.moneda)}`).join(" · ") || null,
};
const info = (r) => `Recibo de ${SERVICIOS[r.servicio]?.nombre.toLowerCase()} · ${r.sede} · ${r.periodo}`;

function datosPago(body, total) {
  if (!ESTADOS_PAGO[body.estadoPago]) throw badRequest("El estado del pago no es válido.");
  if (body.estadoPago !== "pagado") return { estadoPago: body.estadoPago, valorPagado: null, fechaPago: null };
  const valor = body.valorPagado === undefined || body.valorPagado === "" || body.valorPagado === null ? total : r2(numero(body.valorPagado, "El valor pagado"));
  if (valor < 0) throw badRequest("El valor pagado no puede ser negativo.");
  return { estadoPago: "pagado", valorPagado: valor, fechaPago: body.fechaPago ? fechaValida(body.fechaPago, "La fecha de pago") : null };
}

export async function crearRecibo(actor, body) {
  const cuenta = await resolverCuenta(actor, body);
  if (!cuenta.activo) throw badRequest("La cuenta está inactiva: actívala en Sedes y cuentas para cargarle recibos.");
  const { d, cargos } = await datosRecibo(body, cuenta, null);
  await exigirNoDuplicado(cuenta.id, d);
  const pago = body.estadoPago ? datosPago(body, d.totalPagar) : {};
  const medidorId = await resolverMedidor(actor, cuenta, body);
  const creado = await prisma.reciboConsumo.create({
    data: { ...d, ...pago, cuentaId: cuenta.id, medidorId, origen: body.origen === "nova" ? "nova" : "manual", ...quien(actor), cargos: cargos?.length ? { create: cargos.map((c) => ({ ...c, ...quien(actor) })) } : undefined },
  });
  // Consumos de períodos anteriores que traía la gráfica del recibo (solo cuando lo leyó Nova).
  const historial = (Array.isArray(body.historial) ? body.historial : []).filter((h) => h && h.anio >= 2000 && h.anio <= 2100 && h.mes >= 1 && h.mes <= 12 && Number.isFinite(Number(h.consumo))).slice(0, 24);
  if (historial.length) await prisma.historialReciboConsumo.createMany({ data: historial.map((h) => ({ reciboId: creado.id, cuentaId: cuenta.id, anio: Math.round(h.anio), mes: Math.round(h.mes), etiqueta: limpiar(h.etiqueta, 30), consumo: Number(h.consumo), ...quien(actor) })) });
  const r = await obtenerRecibo(creado.id);
  logConsumo(actor, { action: "crear", entityType: "reciboConsumo", recordId: r.id, recordInfo: info(r), after: paraAuditoria(r) }).catch(() => {});
  return r;
}

export async function editarRecibo(actor, id, body) {
  const antes = await obtenerRecibo(id);
  const actual = await prisma.reciboConsumo.findUnique({ where: { id: antes.id } });
  const cuenta = await prisma.cuentaConsumo.findUnique({ where: { id: actual.cuentaId }, include: { medidores: true } });
  const { d, cargos } = await datosRecibo(body, cuenta, actual);
  await exigirNoDuplicado(cuenta.id, { numeroFactura: d.numeroFactura !== undefined ? d.numeroFactura : actual.numeroFactura, periodoDesde: d.periodoDesde || actual.periodoDesde, periodoHasta: d.periodoHasta || actual.periodoHasta }, actual.id);
  if (body.medidorId !== undefined || body.medidor !== undefined) d.medidorId = await resolverMedidor(actor, cuenta, body);
  await prisma.$transaction(async (tx) => {
    await tx.reciboConsumo.update({ where: { id: actual.id }, data: d });
    if (cargos) {
      await tx.cargoReciboConsumo.deleteMany({ where: { reciboId: actual.id } });
      if (cargos.length) await tx.cargoReciboConsumo.createMany({ data: cargos.map((c) => ({ ...c, reciboId: actual.id, ...quien(actor) })) });
    }
  });
  const r = await obtenerRecibo(actual.id);
  logConsumo(actor, { action: "editar", entityType: "reciboConsumo", recordId: r.id, recordInfo: info(r), before: paraAuditoria(antes), after: paraAuditoria(r) }).catch(() => {});
  return r;
}

export async function marcarPago(actor, id, body) {
  const antes = await obtenerRecibo(id);
  await prisma.reciboConsumo.update({ where: { id: antes.id }, data: datosPago(body || {}, antes.totalPagar) });
  const r = await obtenerRecibo(antes.id);
  logConsumo(actor, { action: "editar", entityType: "reciboConsumo", recordId: r.id, recordInfo: info(r), before: paraAuditoria(antes), after: paraAuditoria(r) }).catch(() => {});
  return r;
}

export async function borrarRecibo(actor, id) {
  const antes = await obtenerRecibo(id);
  await prisma.reciboConsumo.delete({ where: { id: antes.id } });
  logConsumo(actor, { action: "eliminar", entityType: "reciboConsumo", recordId: antes.id, recordInfo: info(antes), before: { ...paraAuditoria(antes), soportes: antes.soportes.map((s) => s.nombre).join(" · ") || null } }).catch(() => {});
  return { ok: true };
}

// ---------- Soportes (el PDF o la foto del recibo) ----------

export async function agregarSoporte(actor, reciboId, archivo) {
  const r = await obtenerRecibo(reciboId);
  const p = prepararArchivo(archivo.buffer, archivo.nombre);
  if (p.tipo === "hoja") throw badRequest("El soporte debe ser un PDF o una foto.");
  const sha1 = createHash("sha1").update(archivo.buffer).digest("hex");
  if (await prisma.soporteReciboConsumo.findFirst({ where: { reciboId: r.id, sha1 } })) throw badRequest("Ese archivo ya es soporte de este recibo.");
  const tipoMime = p.documento?.mediaType || p.image?.mediaType || "application/octet-stream";
  const s = await prisma.soporteReciboConsumo.create({ data: { reciboId: r.id, nombre: limpiar(archivo.nombre, 200) || "soporte", tipoMime, tamano: archivo.buffer.length, sha1, contenido: archivo.buffer, ...quien(actor) } });
  logConsumo(actor, { action: "crear", entityType: "soporteReciboConsumo", recordId: s.id, recordInfo: `Soporte «${s.nombre}» · ${info(r)}`, after: { archivo: s.nombre, recibo: info(r) } }).catch(() => {});
  return obtenerRecibo(r.id);
}

export async function descargarSoporte(id) {
  const s = await prisma.soporteReciboConsumo.findUnique({ where: { id: Number(id) || 0 } });
  if (!s) throw notFound("El soporte no existe.");
  return s;
}

export async function borrarSoporte(actor, id) {
  const s = await prisma.soporteReciboConsumo.findUnique({ where: { id: Number(id) || 0 }, select: { id: true, nombre: true, reciboId: true } });
  if (!s) throw notFound("El soporte no existe.");
  const r = await obtenerRecibo(s.reciboId);
  await prisma.soporteReciboConsumo.delete({ where: { id: s.id } });
  logConsumo(actor, { action: "eliminar", entityType: "soporteReciboConsumo", recordId: s.id, recordInfo: `Soporte «${s.nombre}» · ${info(r)}`, before: { archivo: s.nombre, recibo: info(r) } }).catch(() => {});
  return obtenerRecibo(r.id);
}
