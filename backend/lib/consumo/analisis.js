import { prisma } from "@/lib/prisma";
import { todosLosRecibos } from "@/lib/consumo/recibos";
import { SERVICIOS, fmtMoneda, claveNombre } from "@/lib/consumo/comun";

// Análisis de Consumo con la misma estructura del Excel del contador («ejemplo analisis contador mesa de yeguas.xlsx»):
//   resumen()   → la hoja «Resumen Ejecutivo» (indicadores antes → después, conclusiones y datos de las gráficas).
//   auditoria() → la hoja «Auditoría y Hallazgos» (secciones A a G).
// Todo se calcula al vuelo con los recibos guardados; ninguna cifra se escribe a mano. Cuando falta un dato (p. ej.
// recibos sin detalle de cargos) la sección lo dice en vez de inventarlo.

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const suma = (l, f) => l.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const div = (a, b) => (b ? a / b : null);
const varPct = (despues, antes) => (despues != null && antes ? despues / antes - 1 : null);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const fmtN = (v, d = 1) => (v == null ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: d }).format(v));
const fmtP = (v) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtN(Math.abs(v) * 100, 1)} %`);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const masMeses = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const esReal = (r) => r.tipoLectura === "real";
const etiqueta = (r) => `${MESES[r.mes - 1]} ${String(r.anio).slice(2)}${r.tipoLectura === "promediada" || r.tipoLectura === "estimada" ? " (est.)" : ""}`;

// Recibos del filtro, del más viejo al más nuevo. servicio por defecto: energía (como el Excel).
async function recibosDe({ sedeId, servicio = "energia", anio }, precargados = null) {
  const todos = precargados || await todosLosRecibos();
  const lista = todos.filter((r) => r.servicio === servicio && (!sedeId || r.sedeId === Number(sedeId)) && (!anio || r.anio === Number(anio)));
  return lista.sort((a, b) => a.periodoHasta.localeCompare(b.periodoHasta) || a.id - b.id);
}

// Totales de un grupo de recibos: costo efectivo, tarifa, por día…
function metricas(l) {
  const conConsumo = l.filter((r) => r.consumo != null && r.consumo > 0);
  const reales = conConsumo.filter((r) => esReal(r) && r.dias);
  const conDias = l.filter((r) => r.dias);
  const conUnitario = l.filter((r) => r.valorUnitario != null);
  return {
    recibos: l.length,
    gasto: r2(suma(l, (r) => r.totalCargos)),
    costoServicio: r2(suma(l, (r) => r.costoServicio)),
    consumo: suma(conConsumo, (r) => r.consumo),
    consumoDia: div(suma(reales, (r) => r.consumo), suma(reales, (r) => r.dias)),
    costoEfectivo: div(suma(conConsumo, (r) => r.costoServicio), suma(conConsumo, (r) => r.consumo)),
    tarifa: conUnitario.length ? suma(conUnitario, (r) => r.valorUnitario) / conUnitario.length : null,
    costoDia: div(suma(conDias, (r) => r.costoServicio), suma(conDias, (r) => r.dias)),
  };
}

// Dónde partir «antes» y «después»: en el cambio de cuenta o de medidor si lo hay (como Mesa de Yeguas); si no, por la
// mitad de los recibos. Devuelve también cómo se explica el corte.
function corte(l) {
  for (let i = 1; i < l.length; i++) {
    if (l[i].cuentaId !== l[i - 1].cuentaId || (l[i].medidorId && l[i - 1].medidorId && l[i].medidorId !== l[i - 1].medidorId)) {
      const cambio = l[i].cuentaId !== l[i - 1].cuentaId ? `cuenta ${l[i - 1].numeroCuenta} → ${l[i].numeroCuenta}` : `medidor ${l[i - 1].medidor} → ${l[i].medidor}`;
      return { antes: l.slice(0, i), despues: l.slice(i), motivo: `Antes y después del cambio de ${cambio} (${etiqueta(l[i])}).` };
    }
  }
  if (l.length < 2) return { antes: l, despues: [], motivo: "Hace falta más de un recibo para comparar." };
  const m = Math.floor(l.length / 2);
  return { antes: l.slice(0, m), despues: l.slice(m), motivo: `Primera mitad (${etiqueta(l[0])} a ${etiqueta(l[m - 1])}) frente a segunda mitad (${etiqueta(l[m])} a ${etiqueta(l[l.length - 1])}).` };
}

// ---------- E. Riesgo de doble facturación ----------
// Un recibo promediado o estimado de una cuenta cuyo período se cruza con el de OTRA cuenta (o medidor) de la misma
// sede que sí registraba consumo real: puede que se cobre dos veces el mismo consumo.
function dobleCobro(l) {
  const casos = [];
  for (const est of l.filter((r) => r.tipoLectura === "promediada" || r.tipoLectura === "estimada")) {
    const cruces = l.filter((o) => o.id !== est.id && (o.cuentaId !== est.cuentaId || (o.medidorId && o.medidorId !== est.medidorId)) && esReal(o) && o.periodoDesde <= est.periodoHasta && o.periodoHasta >= est.periodoDesde);
    if (!cruces.length) continue;
    const energia = suma(est.cargos.filter((c) => c.grupo === est.servicio), (c) => c.valor) || est.costoServicio;
    const dias = Math.max(...cruces.map((o) => diasEntre(o.periodoDesde > est.periodoDesde ? o.periodoDesde : est.periodoDesde, o.periodoHasta < est.periodoHasta ? o.periodoHasta : est.periodoHasta) + 1));
    const fraccion = Math.min(1, dias / (est.dias || diasEntre(est.periodoDesde, est.periodoHasta) + 1));
    const plazo = est.fechaExpedicion ? masMeses(est.fechaExpedicion, 5) : null;
    casos.push({
      reciboId: est.id, periodo: est.periodo, mes: etiqueta(est), cuenta: est.numeroCuenta, consumo: est.consumo, unidad: est.unidad,
      cruzaCon: cruces.map((o) => `${o.numeroCuenta}${o.medidor ? ` (medidor ${o.medidor})` : ""} · ${o.periodo}`),
      diasCruzados: dias, central: r2(energia * fraccion), maximo: r2(energia), moneda: est.moneda,
      plazoReclamo: plazo, diasParaReclamar: plazo ? diasEntre(hoyCO(), plazo) : null,
    });
  }
  const central = r2(suma(casos, (c) => c.central));
  const maximo = r2(suma(casos, (c) => c.maximo));
  const plazos = casos.map((c) => c.plazoReclamo).filter(Boolean).filter((p) => p >= hoyCO()).sort();
  return { casos, central, maximo, proximoPlazo: plazos[0] || null, diasParaReclamar: plazos[0] ? diasEntre(hoyCO(), plazos[0]) : null };
}

// ---------- Resumen ejecutivo ----------

export async function resumen(filtro = {}) {
  const servicio = SERVICIOS[filtro.servicio] ? filtro.servicio : "energia";
  const l = await recibosDe({ ...filtro, servicio });
  const unidad = SERVICIOS[servicio].unidad === "m3" ? "m³" : SERVICIOS[servicio].unidad;
  const sedes = await prisma.sedeConsumo.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
  const anios = [...new Set((await todosLosRecibos()).filter((r) => r.servicio === servicio && (!filtro.sedeId || r.sedeId === Number(filtro.sedeId))).map((r) => r.anio))].sort((a, b) => b - a);
  const base = { servicio, unidad, sedes, anios, filtro: { sedeId: filtro.sedeId ? Number(filtro.sedeId) : null, anio: filtro.anio ? Number(filtro.anio) : null } };
  if (!l.length) return { ...base, vacio: true };

  const total = metricas(l);
  const { antes, despues, motivo } = corte(l);
  const a = metricas(antes);
  const d = metricas(despues);
  const pagado = r2(suma(l, (r) => r.valorPagado));
  const pendientes = l.filter((r) => r.estadoPago === "pendiente");
  const saldo = r2(suma(pendientes, (r) => r.totalPagar));
  const vencidos = pendientes.filter((r) => r.vencido);
  const conDetalle = l.filter((r) => r.consumo != null && r.cargos.length);
  const dc = dobleCobro(l);
  const unaSede = new Set(l.map((r) => r.sedeId)).size === 1;

  const kpis = [
    { k: "gasto", titulo: "Gasto total facturado", valor: fmtMoneda(total.gasto), nota: `Pagado ${fmtMoneda(pagado)}`, tono: "neutro" },
    { k: "saldo", titulo: "Saldo pendiente", valor: fmtMoneda(saldo), nota: vencidos.length ? `${vencidos.length} vencido(s)${vencidos[0].fechaSuspension ? ` · suspensión ${vencidos[0].fechaSuspension}` : ""}` : pendientes.length ? `${pendientes.length} recibo(s) por pagar` : "Todo pagado", tono: vencidos.length ? "malo" : saldo ? "alerta" : "bueno" },
    { k: "consumo", titulo: `Consumo total (${unidad})`, valor: fmtN(total.consumo, 0), nota: `Promedio ${fmtN(div(total.consumo, l.filter((r) => r.consumo != null).length), 0)} ${unidad} por recibo`, tono: "neutro" },
    { k: "consumoDia", titulo: "Consumo diario antes → después", valor: fmtP(varPct(d.consumoDia, a.consumoDia)), nota: `${fmtN(a.consumoDia)} → ${fmtN(d.consumoDia)} ${unidad}/día (lecturas reales)`, tono: varPct(d.consumoDia, a.consumoDia) > 0.05 ? "malo" : varPct(d.consumoDia, a.consumoDia) < -0.05 ? "bueno" : "neutro" },
    { k: "costoEfectivo", titulo: `Costo efectivo por ${unidad} antes → después`, valor: fmtP(varPct(d.costoEfectivo, a.costoEfectivo)), nota: `${fmtMoneda(a.costoEfectivo)} → ${fmtMoneda(d.costoEfectivo)} por ${unidad} (todo incluido)`, tono: varPct(d.costoEfectivo, a.costoEfectivo) > 0.05 ? "malo" : "neutro" },
    { k: "tarifa", titulo: "Tarifa unitaria antes → después", valor: fmtP(varPct(d.tarifa, a.tarifa)), nota: `${a.tarifa != null ? `COP ${fmtN(a.tarifa, 2)}` : "—"} → ${d.tarifa != null ? `COP ${fmtN(d.tarifa, 2)}` : "—"} por ${unidad}`, tono: varPct(d.tarifa, a.tarifa) > 0.05 ? "malo" : "neutro" },
    { k: "costoDia", titulo: "Costo por día antes → después", valor: fmtP(varPct(d.costoDia, a.costoDia)), nota: `${fmtMoneda(a.costoDia)} → ${fmtMoneda(d.costoDia)} diarios`, tono: varPct(d.costoDia, a.costoDia) > 0.05 ? "malo" : "neutro" },
    { k: "dobleCobro", titulo: "Posible doble cobro", valor: fmtMoneda(dc.central), nota: dc.casos.length ? `Rango hasta ${fmtMoneda(dc.maximo)}${dc.proximoPlazo ? ` · reclamar antes del ${dc.proximoPlazo}` : ""}` : "No se encontraron cruces de lecturas estimadas", tono: dc.casos.length ? "malo" : "bueno" },
  ];

  // Conclusiones redactadas con las mismas cifras (código, no IA: siempre cuadran con los indicadores).
  const conclusiones = [];
  const vC = varPct(d.consumoDia, a.consumoDia);
  if (vC != null) conclusiones.push(`El consumo diario ${Math.abs(vC) < 0.05 ? "casi no cambió" : vC > 0 ? "aumentó" : "bajó"}: pasó de ${fmtN(a.consumoDia)} a ${fmtN(d.consumoDia)} ${unidad}/día (${fmtP(vC)}). ${motivo}`);
  const vE = varPct(d.costoEfectivo, a.costoEfectivo);
  if (vE != null && Math.abs(vE) >= 0.03) {
    const causas = [];
    const vT = varPct(d.tarifa, a.tarifa);
    if (vT != null && Math.abs(vT) >= 0.02) causas.push(`la tarifa ${fmtP(vT)}`);
    const otros = (g) => suma(g.flatMap((r) => r.cargos.filter((c) => c.grupo !== servicio && c.grupo !== "aseo")), (c) => c.valor);
    const oA = div(otros(antes), antes.length); const oD = div(otros(despues), despues.length);
    if (oA != null && oD != null && oD - oA > 10000) causas.push(`otros cargos por recibo (alumbrado, créditos, ajustes) de ${fmtMoneda(oA)} a ${fmtMoneda(oD)}`);
    conclusiones.push(`Cada ${unidad} cuesta ${fmtP(vE)} ${vE > 0 ? "más" : "menos"} que antes (${fmtMoneda(a.costoEfectivo)} → ${fmtMoneda(d.costoEfectivo)}, todo incluido)${causas.length ? `: lo explican ${causas.join(" y ")}` : ""}.`);
  }
  if (dc.casos.length) conclusiones.push(`Riesgo de doble cobro: ${dc.casos.length} recibo(s) con lectura estimada se cruzan con consumo real registrado en otra cuenta o medidor. Exposición estimada ${fmtMoneda(dc.central)} (máximo ${fmtMoneda(dc.maximo)})${dc.proximoPlazo ? `; plazo para reclamar: ${dc.proximoPlazo} (${dc.diasParaReclamar} días)` : ""}.`);
  if (vencidos.length) conclusiones.push(`${vencidos.length === 1 ? "Hay un recibo vencido" : `Hay ${vencidos.length} recibos vencidos`} por ${fmtMoneda(suma(vencidos, (r) => r.totalPagar))}${vencidos[0].fechaSuspension ? `; la suspensión del servicio está prevista para el ${vencidos[0].fechaSuspension}` : ""}.`);
  const titulares = [...new Set(l.map((r) => r.titular).filter(Boolean))];
  if (unaSede && titulares.length > 1) conclusiones.push(`Los recibos de esta sede salen a nombre de titulares distintos (${titulares.join(", ")}): verifica que la cuenta vigente esté a nombre de la empresa para que sea soporte contable válido.`);
  const sinDetalle = l.filter((r) => !r.cargos.length);
  if (sinDetalle.length) conclusiones.push(`${sinDetalle.length} recibo(s) solo tienen el total, sin detalle de cargos (${sinDetalle.map(etiqueta).join(", ")}): no entran en el análisis por concepto.`);
  const dePago = l.filter((r) => r.valorPagado != null && r.valorPagado > r.totalPagar * 1.5 && r.totalPagar > 0);
  if (dePago.length) conclusiones.push(`Pago de más en ${dePago.map(etiqueta).join(", ")}: se pagó ${fmtMoneda(suma(dePago, (r) => r.valorPagado))} por recibos de ${fmtMoneda(suma(dePago, (r) => r.totalPagar))}; revisa que el saldo a favor se haya compensado.`);

  // Gráficas: por recibo cuando es una sede; por mes cuando son varias.
  let porPeriodo;
  if (unaSede) {
    porPeriodo = l.map((r) => ({ key: String(r.id), label: etiqueta(r), consumo: r.consumo, consumoDia: r.consumoDia, totalCargos: r.costoServicio, tarifa: r.valorUnitario }));
  } else {
    const m = new Map();
    for (const r of l) { const k = `${r.anio}-${String(r.mes).padStart(2, "0")}`; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    porPeriodo = [...m.entries()].sort().map(([k, g]) => { const x = metricas(g); return { key: k, label: `${MESES[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`, consumo: x.consumo, consumoDia: null, totalCargos: x.costoServicio, tarifa: x.tarifa, costoEfectivo: x.costoEfectivo }; });
  }
  // Tabla «Cuenta / medidor»: gasto, consumo y costo efectivo de cada cuenta (o de cada sede si son varias).
  const grupos = new Map();
  for (const r of l) { const k = unaSede ? `${r.cuentaId}` : `${r.sedeId}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }
  const porCuenta = [...grupos.values()].map((g) => {
    const x = metricas(g); const p = g[0];
    return { key: unaSede ? `c${p.cuentaId}` : `s${p.sedeId}`, nombre: unaSede ? `${p.numeroCuenta}${p.medidor ? ` · medidor ${p.medidor}` : ""}` : p.sede, detalle: `${etiqueta(g[0])} a ${etiqueta(g[g.length - 1])} · ${g.length} recibo(s)`, gasto: x.gasto, consumo: x.consumo, costoEfectivo: x.costoEfectivo, sedeId: p.sedeId };
  }).sort((x, y) => y.gasto - x.gasto);

  return {
    ...base, vacio: false, unaSede, sede: unaSede ? l[0].sede : null, corte: motivo,
    periodo: `${etiqueta(l[0])} a ${etiqueta(l[l.length - 1])}`, recibos: l.length, conDetalle: conDetalle.length,
    kpis, conclusiones, porPeriodo, porCuenta,
    calculos: { antes: a, despues: d, total, pagado, saldo, dobleCobro: { central: dc.central, maximo: dc.maximo } },
  };
}

// ---------- Auditoría y hallazgos ----------

const extrasDe = (txt) => { try { return txt ? JSON.parse(txt) : {}; } catch { return {}; } };
const buscarExtra = (ex, re) => { const k = Object.keys(ex).find((x) => re.test(x)); return k ? ex[k] : null; };
const aNum = (s) => { if (s == null) return null; const m = String(s).replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

// `precargados` (opcional): la lista de todosLosRecibos() ya leída, para que el agente de hallazgos revise todas las
// sedes sin volver a leer la base en cada una.
export async function auditoria(filtro = {}, precargados = null) {
  const servicio = SERVICIOS[filtro.servicio] ? filtro.servicio : "energia";
  const todosL = precargados || await todosLosRecibos();
  const sedes = await prisma.sedeConsumo.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
  // La auditoría es de UNA sede: sin sede elegida se toma la que tenga más recibos del servicio.
  let sedeId = Number(filtro.sedeId) || null;
  if (!sedeId) {
    const cuenta = new Map();
    for (const r of todosL.filter((x) => x.servicio === servicio)) cuenta.set(r.sedeId, (cuenta.get(r.sedeId) || 0) + 1);
    sedeId = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  const l = sedeId ? await recibosDe({ sedeId, servicio, anio: filtro.anio }, todosL) : [];
  const unidad = SERVICIOS[servicio].unidad === "m3" ? "m³" : SERVICIOS[servicio].unidad;
  const anios = [...new Set(todosL.filter((r) => r.servicio === servicio && r.sedeId === sedeId).map((r) => r.anio))].sort((a, b) => b - a);
  const base = { servicio, unidad, sedes, anios, sedeId, filtro: { anio: filtro.anio ? Number(filtro.anio) : null } };
  if (!l.length) return { ...base, vacio: true };
  const extras = Object.fromEntries((await prisma.reciboConsumo.findMany({ where: { id: { in: l.map((r) => r.id) } }, select: { id: true, extras: true } })).map((x) => [x.id, extrasDe(x.extras)]));
  const cuentas = [...new Map(l.map((r) => [r.cuentaId, r])).values()];
  const cuentaInfo = await prisma.cuentaConsumo.findMany({ where: { id: { in: cuentas.map((c) => c.cuentaId) } }, include: { medidores: true } });

  // A. Desglose de conceptos: cada concepto (agrupado por nombre sin tildes) por cuenta, total y % del total con detalle.
  const conDetalle = l.filter((r) => r.cargos.length);
  const conceptos = new Map();
  for (const r of conDetalle) for (const c of r.cargos) {
    const k = `${c.grupo}|${claveNombre(c.concepto).replace(/\d+/g, "").replace(/\s+/g, " ").trim()}`;
    if (!conceptos.has(k)) conceptos.set(k, { concepto: c.concepto, grupo: c.grupo, porCuenta: {}, total: 0, recibos: new Set() });
    const x = conceptos.get(k);
    x.porCuenta[r.cuentaId] = r2((x.porCuenta[r.cuentaId] || 0) + c.valor);
    x.total = r2(x.total + c.valor); x.recibos.add(r.id);
  }
  const totalDetalle = r2(suma(conDetalle, (r) => r.totalCargos));
  const desglose = {
    cuentas: cuentas.map((c) => ({ id: c.cuentaId, nombre: c.numeroCuenta, periodo: `${etiqueta(l.filter((r) => r.cuentaId === c.cuentaId)[0])} a ${etiqueta(l.filter((r) => r.cuentaId === c.cuentaId).slice(-1)[0])}` })),
    filas: [...conceptos.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).map((x) => ({ concepto: x.concepto, grupo: x.grupo, porCuenta: x.porCuenta, total: x.total, pct: div(x.total, totalDetalle), recibos: x.recibos.size, de: conDetalle.length })),
    totalPorCuenta: Object.fromEntries(cuentas.map((c) => [c.cuentaId, r2(suma(conDetalle.filter((r) => r.cuentaId === c.cuentaId), (r) => r.totalCargos))])),
    total: totalDetalle, sinDetalle: l.filter((r) => !r.cargos.length).map((r) => ({ id: r.id, mes: etiqueta(r), total: r.totalCargos })),
  };

  // B. Energía reactiva y factor de potencia (si los recibos la traen en los datos extra).
  const reactiva = servicio !== "energia" ? [] : l.map((r) => {
    const v = aNum(buscarExtra(extras[r.id], /reactiv/i));
    if (v == null || !r.consumo) return null;
    const pct = v / r.consumo;
    return { mes: etiqueta(r), activa: r.consumo, reactiva: v, pct, fp: Math.cos(Math.atan(pct)), cobro: pct > 0.5 };
  }).filter(Boolean);

  // C. Comparativo técnico y comercial entre cuentas: lo del maestro y lo del último recibo de cada cuenta.
  const ultimo = (cid) => l.filter((r) => r.cuentaId === cid).slice(-1)[0];
  const atributo = (titulo, f, implicacion) => {
    const valores = cuentas.map((c) => f(cuentaInfo.find((x) => x.id === c.cuentaId), ultimo(c.cuentaId), extras[ultimo(c.cuentaId).id] || {}) ?? "—");
    const cambia = new Set(valores.filter((v) => v !== "—")).size > 1;
    return { titulo, valores, cambia, implicacion: cambia ? implicacion : "" };
  };
  const comparativo = {
    cuentas: cuentas.map((c) => c.numeroCuenta),
    filas: [
      atributo("Titular de la cuenta", (c) => c?.titular, "Titular distinto: confirma que la cuenta vigente esté a nombre de la empresa (soporte contable válido)."),
      atributo("Dirección en el recibo", (c) => c?.direccionRecibo, "La nomenclatura cambia: confirma que es el mismo predio y el mismo suministro."),
      atributo("Clase de servicio / estrato", (c) => [c?.claseUso, c?.estrato].filter(Boolean).join(" · ") || null, "Cambio de clase de servicio: puede cambiar la contribución y el alumbrado público."),
      atributo("Medidor", (c, r) => r.medidor || c?.medidores.map((m) => m.numero).join(", ") || null, "Cambio de medidor: revisa el empalme de lecturas entre los dos."),
      atributo("Factor del medidor", (c, r) => (r.factor != null ? fmtN(r.factor, 4) : null), "Factor distinto de 1: el consumo se multiplica."),
      atributo("Tipo de liquidación", (c, r, ex) => buscarExtra(ex, /liquidaci/i) || (c?.periodicidad === "bimestral" ? "Bimestral" : "Mensual"), "Cambia la periodicidad: un consumo bimestral no es un pico mensual."),
      atributo("Circuito / transformador", (c, r, ex) => buscarExtra(ex, /circuito|trafo|transformador/i), "Otro circuito: puede cambiar la calidad del servicio."),
      atributo("Carga instalada", (c, r, ex) => buscarExtra(ex, /carga/i), "Cambió la carga contratada."),
      atributo("Horas de interrupción (DIU)", (c, r, ex) => buscarExtra(ex, /^DIU$|duraci[oó]n.*interrup/i), "Calidad distinta entre circuitos: puede dar derecho a compensación."),
      atributo("Eventos de interrupción (FIU)", (c, r, ex) => buscarExtra(ex, /^FIU$|frecuencia.*interrup/i), "Calidad distinta entre circuitos."),
      atributo("Tipo de lectura del último período", (c, r) => ({ real: "Real", promediada: "Promediada", estimada: "Estimada", sin_consumo: "Sin consumo" })[r.tipoLectura], "Lecturas estimadas: revisa el empalme con la cuenta o el medidor que sí leía."),
    ].filter((f) => f.valores.some((v) => v !== "—")),
  };

  // D. Recibos sin factura detallada: costo efectivo implícito frente al de los recibos con detalle.
  const ref = metricas(conDetalle.filter((r) => r.consumo));
  const sinFactura = l.filter((r) => !r.cargos.length).map((r) => {
    const implicito = div(r.totalCargos, r.consumo);
    return { id: r.id, mes: etiqueta(r), periodo: r.periodo, factura: r.numeroFactura, total: r.totalCargos, consumo: r.consumo, implicito, referencia: ref.costoEfectivo, diferencia: implicito != null && ref.costoEfectivo ? implicito / ref.costoEfectivo - 1 : null };
  });

  // E. Riesgo de doble facturación.
  const doble = dobleCobro(l);

  // F. Crédito de conexión (cargos del grupo «financiado» del último recibo que los tenga).
  const conCredito = l.filter((r) => r.cargos.some((c) => c.grupo === "financiado")).slice(-1)[0];
  let credito = null;
  if (conCredito) {
    const capital = suma(conCredito.cargos.filter((c) => c.grupo === "financiado" && !/inter[eé]s/i.test(c.concepto)), (c) => c.valor);
    const interes = suma(conCredito.cargos.filter((c) => c.grupo === "financiado" && /inter[eé]s/i.test(c.concepto)), (c) => c.valor);
    const saldo = aNum(buscarExtra(extras[conCredito.id], /saldo.*cr[eé]dito|cr[eé]dito.*saldo|saldo.*conexi/i));
    const tasa = saldo ? interes / (saldo + capital) : null;
    credito = { mes: etiqueta(conCredito), capital, interes, saldo, tasaPeriodo: tasa, tasaAnual: tasa != null && conCredito.dias ? (1 + tasa) ** (365 / conCredito.dias) - 1 : null, cuotas: saldo && capital ? Math.ceil(saldo / capital) : null };
  }

  // G. Hallazgos y acciones recomendadas (con prioridad), todos con su cifra. `tipo`, `id` (lo que lo identifica dentro de
  // la sede y el servicio), `valor` (la plata en juego) y `confianza` los usa el agente de hallazgos (agentes.js).
  const hallazgos = [];
  for (const r of l.filter((x) => x.vencido)) hallazgos.push({ tipo: "vencido", id: `r${r.id}`, confianza: "alta", valor: r.totalPagar, prioridad: "URGENTE", titulo: `Recibo de ${etiqueta(r)} (${fmtMoneda(r.totalPagar)}) vencido${r.fechaSuspension ? `; suspensión prevista el ${r.fechaSuspension}` : ""}.`, accion: "Pagarlo cuanto antes para evitar la suspensión y los costos de reconexión.", reciboId: r.id });
  for (const c of doble.casos) hallazgos.push({ tipo: "doble_cobro", id: `r${c.reciboId}`, confianza: "media", valor: c.central, prioridad: "ALTA", titulo: `Doble facturación probable en ${c.mes}: la cuenta ${c.cuenta} cobró ${fmtN(c.consumo, 0)} ${unidad} con lectura estimada mientras se registraba consumo real en ${c.cruzaCon.join("; ")}.`, accion: `Radicar reclamación ante la empresa${c.plazoReclamo ? ` antes del ${c.plazoReclamo}${c.diasParaReclamar != null ? ` (${c.diasParaReclamar} días)` : ""}` : ""} pidiendo reliquidar ese período. Exposición: ${fmtMoneda(c.central)} (máximo ${fmtMoneda(c.maximo)}).`, reciboId: c.reciboId, plazoReclamo: c.plazoReclamo });
  const tit = comparativo.filas.find((f) => f.titulo.startsWith("Titular") && f.cambia);
  if (tit) hallazgos.push({ tipo: "titular", id: "sede", confianza: "alta", valor: null, prioridad: "ALTA", titulo: `Las cuentas de la sede tienen titulares distintos (${tit.valores.join(" / ")}).`, accion: "Confirmar que la cuenta vigente esté a nombre de la empresa (NIT); si no, solicitar el cambio de titular y revisar la clase de servicio." });
  const alumbrado = l.map((r) => ({ r, v: suma(r.cargos.filter((c) => /alumbrado/i.test(c.concepto)), (c) => c.valor) })).filter((x) => x.v > 0);
  if (alumbrado.length >= 2) {
    const min = Math.min(...alumbrado.map((x) => x.v)); const ult = alumbrado[alumbrado.length - 1];
    if (ult.v > min * 1.5) hallazgos.push({ tipo: "alumbrado", id: `r${ult.r.id}`, confianza: "media", valor: r2(ult.v - min), prioridad: "MEDIA", titulo: `El alumbrado público pasó de ${fmtMoneda(min)} a ${fmtMoneda(ult.v)} por período (${etiqueta(ult.r)}).`, accion: "Revisar con la secretaría de hacienda del municipio la tarifa que corresponde a la clase de servicio real.", reciboId: ult.r.id });
  }
  for (const s of sinFactura) hallazgos.push({ tipo: "sin_factura", id: `r${s.id}`, confianza: "alta", valor: s.total, prioridad: "MEDIA", titulo: `Recibo de ${s.mes} (${fmtMoneda(s.total)}) sin factura detallada.`, accion: `Conseguir la factura${s.factura ? ` ${s.factura}` : ""} para soporte contable y adjuntarla.${s.diferencia != null ? ` Su costo implícito (${fmtMoneda(s.implicito)} por ${unidad}) está ${fmtP(s.diferencia)} frente a los recibos con detalle.` : ""}`, reciboId: s.id });
  if (credito) hallazgos.push({ tipo: "credito", id: `r${conCredito.id}`, confianza: "media", valor: credito.saldo, prioridad: "MEDIA", titulo: `Crédito de conexión cobrado en el recibo: cuota ${fmtMoneda(credito.capital)} e interés ${fmtMoneda(credito.interes)}${credito.saldo ? ` (saldo ${fmtMoneda(credito.saldo)})` : ""}.`, accion: credito.tasaAnual != null ? `Tasa efectiva anual aproximada ${fmtN(credito.tasaAnual * 100, 1)} %: evaluar el prepago total.` : "Pedir a la empresa el saldo y la tasa del crédito para evaluar el prepago.", reciboId: conCredito.id });
  const promediadas = l.filter((r) => (r.tipoLectura === "promediada" || r.tipoLectura === "estimada") && !doble.casos.some((c) => c.reciboId === r.id));
  if (promediadas.length) hallazgos.push({ tipo: "lectura_estimada", id: "grupo", confianza: "alta", valor: null, prioridad: "MEDIA", titulo: `${promediadas.length} recibo(s) con lectura promediada o estimada (${promediadas.map(etiqueta).join(", ")}).`, accion: "Pedir la lectura real del medidor y la reliquidación si el consumo estimado fue mayor al real.", porRecibo: promediadas.map((r) => ({ reciboId: r.id, mes: etiqueta(r), tipoLectura: r.tipoLectura, consumo: r.consumo, unidad, total: r.costoServicio, fechaExpedicion: r.fechaExpedicion, cuenta: r.numeroCuenta })) });
  for (const r of l.filter((x) => x.valorPagado != null && x.totalPagar > 0 && x.valorPagado > x.totalPagar * 1.5)) hallazgos.push({ tipo: "pago_de_mas", id: `r${r.id}`, confianza: "alta", valor: r2(r.valorPagado - r.totalPagar), prioridad: "BAJA", titulo: `Pago de más en ${etiqueta(r)}: se pagaron ${fmtMoneda(r.valorPagado)} por un recibo de ${fmtMoneda(r.totalPagar)}.`, accion: "Confirmar que el saldo a favor se compensó en los recibos siguientes y reforzar el control de pagos.", reciboId: r.id });
  if (reactiva.length && !reactiva.some((x) => x.cobro)) hallazgos.push({ tipo: "reactiva", id: "sede", confianza: "alta", valor: null, prioridad: "INFORMATIVO", titulo: `Energía reactiva por debajo del 50 % de la activa en ${reactiva.length} período(s): sin cobro.`, accion: `Factor de potencia mínimo ${fmtN(Math.min(...reactiva.map((x) => x.fp)), 3)}: monitorearlo.` });
  const orden = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAJA: 3, INFORMATIVO: 4 };
  hallazgos.sort((a, b) => orden[a.prioridad] - orden[b.prioridad]);

  return {
    ...base, vacio: false, sede: l[0].sede, periodo: `${etiqueta(l[0])} a ${etiqueta(l[l.length - 1])}`, recibos: l.length,
    desglose, reactiva, comparativo, sinFactura, dobleCobro: doble, credito, hallazgos,
  };
}
