import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { badRequest, notFound, limpiar, numero, fechaValida, fmtMoneda } from "@/lib/tesoreria/comun";
import { mapasCatalogos } from "@/lib/tesoreria/movimientos";

// Pagos recurrentes: cada uno genera solo el PROYECTADO de cada periodo (del mes actual a HORIZONTE meses adelante;
// nunca hacia atrás, para no llenar el libro de vencidos). Uno por recurrente y periodo (índice único), así generar
// varias veces no duplica. Cuando llega el soporte o la línea del extracto, ese proyectado pasa a ejecutado (y si el
// valor es variable, toma el real). Cambiar o apagar un recurrente rehace solo los proyectados futuros sin pagar ni
// conciliar; lo ya pagado no se toca. detectarRecurrentes propone recurrentes a partir de lo ya pagado (sin IA).

export const FRECUENCIAS = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
const HORIZONTE = 3; // meses adelante
const num = (d) => (d == null ? 0 : Number(d));
const ym = (f) => f.slice(0, 7);
const sumarMeses = (periodo, n) => { const [a, m] = periodo.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const ultimoDia = (periodo) => { const [a, m] = periodo.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const fechaDe = (periodo, dia) => `${periodo}-${String(Math.min(dia, ultimoDia(periodo))).padStart(2, "0")}`;
const mesesEntre = (a, b) => { const [y1, m1] = a.split("-").map(Number); const [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

// Periodos (AAAA-MM) de un recurrente entre desde y hasta (incluidos), según su frecuencia.
function periodos(r, desde, hasta) {
  const paso = FRECUENCIAS[r.frecuencia] || 1;
  const inicio = ym(r.desde);
  const fin = r.hasta ? ym(r.hasta) : null;
  const out = [];
  let p = inicio;
  // Primer periodo de la serie que no sea anterior a «desde».
  if (mesesEntre(p, desde) > 0) p = sumarMeses(inicio, Math.ceil(mesesEntre(inicio, desde) / paso) * paso);
  for (; mesesEntre(p, hasta) >= 0; p = sumarMeses(p, paso)) {
    if (fin && mesesEntre(fin, p) > 0) break;
    out.push(p);
  }
  return out;
}

export function describir(r) {
  const cada = { mensual: "Cada mes", bimestral: "Cada 2 meses", trimestral: "Cada 3 meses", semestral: "Cada 6 meses", anual: "Cada año" }[r.frecuencia] || "Cada mes";
  return `${cada}, el día ${r.diaDelMes}`;
}

function aMovimiento(r, periodo) {
  return {
    fecha: fechaDe(periodo, r.diaDelMes), fechaAproximada: false, tipo: r.tipo, estado: "proyectado", valor: r.valor, moneda: r.moneda,
    cuentaId: r.cuentaId, cuentaDestinoId: r.tipo === "traslado" ? r.cuentaDestinoId : null, itemId: r.itemId, conceptoId: r.conceptoId,
    concepto: r.conceptoNombre, pagadorId: r.pagadorId, tercero: r.tercero,
    observacion: r.valorVariable ? `Proyectado del recurrente «${r.nombre}» (valor estimado: se ajusta con el real).` : `Proyectado del recurrente «${r.nombre}».`,
    origen: "recurrente", recurrenciaId: r.id, periodoRecurrencia: periodo, creadoPorNombre: "Pago recurrente",
  };
}

// Genera los proyectados que falten (del mes actual a HORIZONTE meses). Devuelve cuántos creó.
export async function generarProyectados({ recurrenciaId = null, actor = null } = {}) {
  const hoy = hoyColombia();
  const desde = ym(hoy);
  const hasta = sumarMeses(desde, HORIZONTE);
  const recs = await prisma.recurrenciaTesoreria.findMany({ where: { activo: true, ...(recurrenciaId ? { id: recurrenciaId } : {}) } });
  if (!recs.length) return 0;
  const conceptos = new Map((await prisma.conceptoTesoreria.findMany({ select: { id: true, nombre: true } })).map((c) => [c.id, c.nombre]));
  const firmados = new Set((await prisma.cierreMes.findMany({ select: { anio: true, mes: true } })).map((c) => `${c.anio}-${String(c.mes).padStart(2, "0")}`));
  const existentes = new Set((await prisma.movimientoTesoreria.findMany({ where: { recurrenciaId: { in: recs.map((r) => r.id) } }, select: { recurrenciaId: true, periodoRecurrencia: true } })).map((m) => `${m.recurrenciaId}|${m.periodoRecurrencia}`));
  const nuevos = [];
  for (const r of recs) {
    for (const p of periodos(r, desde, hasta)) {
      if (existentes.has(`${r.id}|${p}`) || firmados.has(p)) continue;
      nuevos.push(aMovimiento({ ...r, conceptoNombre: conceptos.get(r.conceptoId) || r.nombre }, p));
    }
  }
  if (nuevos.length) {
    await prisma.movimientoTesoreria.createMany({ data: nuevos, skipDuplicates: true });
    logTesoreria(actor || { nombre: "Pago recurrente" }, {
      action: "generar", entityType: "recurrenciaTesoreria", recordId: recurrenciaId || "todos",
      recordInfo: `Proyectados de pagos recurrentes hasta ${hasta}`, after: { nombre: `${nuevos.length} proyectado(s) generado(s)` },
    }).catch(() => {});
  }
  return nuevos.length;
}

// Quita los proyectados futuros que aún no se pagan ni se concilian (para rehacerlos o porque el recurrente se apagó).
async function quitarProyectadosFuturos(recurrenciaId) {
  const hoy = hoyColombia();
  const r = await prisma.movimientoTesoreria.deleteMany({ where: { recurrenciaId, estado: "proyectado", fecha: { gte: hoy }, lineas: { none: {} }, soportes: { none: {} } } });
  return r.count;
}

async function datosValidos(body, actual = null) {
  const v = (k) => (body[k] !== undefined ? body[k] : actual?.[k]);
  const nombre = limpiar(v("nombre"), 160);
  if (!nombre) throw badRequest("Ponle un nombre al pago recurrente (p. ej. «Arriendo oficina 501»).");
  const tipo = v("tipo");
  if (!["ingreso", "egreso", "traslado"].includes(tipo)) throw badRequest("Tipo inválido: ingreso, egreso o traslado.");
  const valor = numero(v("valor"));
  if (!(valor > 0)) throw badRequest("El valor debe ser mayor que cero.");
  const cuenta = await prisma.cuentaTesoreria.findUnique({ where: { id: Number(v("cuentaId")) || 0 } });
  if (!cuenta) throw badRequest("Elige la cuenta.");
  let cuentaDestinoId = null;
  if (tipo === "traslado") {
    const d = await prisma.cuentaTesoreria.findUnique({ where: { id: Number(v("cuentaDestinoId")) || 0 } });
    if (!d || d.id === cuenta.id) throw badRequest("Un traslado necesita otra cuenta como destino.");
    if (d.moneda !== cuenta.moneda) throw badRequest("Las dos cuentas deben tener la misma moneda.");
    cuentaDestinoId = d.id;
  }
  const concepto = await prisma.conceptoTesoreria.findUnique({ where: { id: Number(v("conceptoId")) || 0 } });
  if (!concepto) throw badRequest("Elige el concepto.");
  const frecuencia = v("frecuencia") || "mensual";
  if (!FRECUENCIAS[frecuencia]) throw badRequest("Frecuencia inválida.");
  const diaDelMes = Number(v("diaDelMes"));
  if (!(diaDelMes >= 1 && diaDelMes <= 31)) throw badRequest("El día del mes debe estar entre 1 y 31.");
  const desde = fechaValida(v("desde") || `${hoyColombia().slice(0, 7)}-01`, "La fecha de inicio");
  const hasta = v("hasta") ? fechaValida(v("hasta"), "La fecha final") : null;
  if (hasta && hasta < desde) throw badRequest("La fecha final no puede ser antes del inicio.");
  return {
    nombre, tipo, valor, valorVariable: !!v("valorVariable"), moneda: cuenta.moneda, cuentaId: cuenta.id, cuentaDestinoId,
    itemId: Number(v("itemId")) || concepto.itemId || null, conceptoId: concepto.id, pagadorId: Number(v("pagadorId")) || null,
    tercero: limpiar(v("tercero"), 200), frecuencia, diaDelMes, desde, hasta, activo: v("activo") === undefined ? true : !!v("activo"),
  };
}

async function paraAuditoria(r) {
  if (!r) return null;
  const m = await mapasCatalogos();
  return {
    nombre: r.nombre, tipo: r.tipo, valor: `${fmtMoneda(r.valor, r.moneda)}${r.valorVariable ? " (variable)" : ""}`, cuenta: m.cuentas.get(r.cuentaId)?.nombre,
    concepto: m.conceptos.get(r.conceptoId)?.nombre, item: r.itemId ? m.items.get(r.itemId)?.nombre : null, frecuencia: describir(r),
    vigencia: `${r.desde}${r.hasta ? ` a ${r.hasta}` : " sin fin"}`, activo: r.activo ? "Sí" : "No",
  };
}

export async function listRecurrencias() {
  const hoy = hoyColombia();
  const [recs, mapas, stats, proximos] = await Promise.all([
    prisma.recurrenciaTesoreria.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    mapasCatalogos(),
    prisma.movimientoTesoreria.groupBy({ by: ["recurrenciaId", "estado"], where: { recurrenciaId: { not: null } }, _count: { _all: true } }),
    prisma.movimientoTesoreria.findMany({ where: { recurrenciaId: { not: null }, estado: "proyectado", fecha: { gte: hoy } }, orderBy: { fecha: "asc" }, select: { recurrenciaId: true, fecha: true } }),
  ]);
  const proximo = new Map();
  for (const p of proximos) if (!proximo.has(p.recurrenciaId)) proximo.set(p.recurrenciaId, p.fecha);
  return recs.map((r) => ({
    ...r, valor: num(r.valor), valorTexto: fmtMoneda(r.valor, r.moneda), descripcion: describir(r),
    cuenta: mapas.cuentas.get(r.cuentaId)?.nombre, cuentaDestino: r.cuentaDestinoId ? mapas.cuentas.get(r.cuentaDestinoId)?.nombre : null,
    concepto: mapas.conceptos.get(r.conceptoId)?.nombre, item: r.itemId ? mapas.items.get(r.itemId)?.nombre : null,
    pagador: r.pagadorId ? mapas.pagadores.get(r.pagadorId)?.nombre : null,
    proximo: proximo.get(r.id) || null,
    proyectados: stats.find((s) => s.recurrenciaId === r.id && s.estado === "proyectado")?._count._all || 0,
    ejecutados: stats.find((s) => s.recurrenciaId === r.id && s.estado === "ejecutado")?._count._all || 0,
  }));
}

export async function crearRecurrencia(actor, body) {
  const data = await datosValidos(body);
  const r = await prisma.recurrenciaTesoreria.create({ data: { ...data, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  logTesoreria(actor, { action: "crear", entityType: "recurrenciaTesoreria", recordId: r.id, recordInfo: `Pago recurrente «${r.nombre}»`, after: await paraAuditoria(r) }).catch(() => {});
  const generados = await generarProyectados({ recurrenciaId: r.id, actor });
  return { recurrencia: r, generados };
}

export async function editarRecurrencia(actor, id, body) {
  const actual = await prisma.recurrenciaTesoreria.findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound("Ese pago recurrente no existe.");
  const data = await datosValidos(body, { ...actual, valor: num(actual.valor) });
  const r = await prisma.recurrenciaTesoreria.update({ where: { id: actual.id }, data });
  // Lo futuro sin pagar se rehace con los datos nuevos; lo ya pagado o conciliado no se toca.
  const quitados = await quitarProyectadosFuturos(r.id);
  const generados = r.activo ? await generarProyectados({ recurrenciaId: r.id, actor }) : 0;
  logTesoreria(actor, { action: "editar", entityType: "recurrenciaTesoreria", recordId: r.id, recordInfo: `Pago recurrente «${r.nombre}»`, before: await paraAuditoria(actual), after: await paraAuditoria(r) }).catch(() => {});
  return { recurrencia: r, quitados, generados };
}

export async function borrarRecurrencia(actor, id) {
  const actual = await prisma.recurrenciaTesoreria.findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound("Ese pago recurrente no existe.");
  const quitados = await quitarProyectadosFuturos(actual.id);
  await prisma.recurrenciaTesoreria.delete({ where: { id: actual.id } }); // lo ya generado queda, sin el enlace al recurrente
  logTesoreria(actor, { action: "eliminar", entityType: "recurrenciaTesoreria", recordId: actual.id, recordInfo: `Pago recurrente «${actual.nombre}»`, before: await paraAuditoria(actual) }).catch(() => {});
  return { quitados };
}

// Propuestas de recurrentes a partir de lo ya pagado: mismo concepto, cuenta y tipo en al menos 3 de los últimos 6
// meses. Valor = la mediana (variable si cambia más de 5 %); día = el más común entre los que tienen fecha exacta.
export async function detectarRecurrentes() {
  const hoy = hoyColombia();
  const desde = `${sumarMeses(ym(hoy), -6)}-01`;
  const [movs, recs, mapas] = await Promise.all([
    prisma.movimientoTesoreria.findMany({ where: { estado: "ejecutado", tipo: { not: "traslado" }, fecha: { gte: desde, lte: hoy }, conceptoId: { not: null } } }),
    prisma.recurrenciaTesoreria.findMany({ where: { activo: true }, select: { conceptoId: true, cuentaId: true, tipo: true } }),
    mapasCatalogos(),
  ]);
  const cubiertos = new Set(recs.map((r) => `${r.conceptoId}|${r.cuentaId}|${r.tipo}`));
  const grupos = new Map();
  for (const m of movs) {
    const k = `${m.conceptoId}|${m.cuentaId}|${m.tipo}`;
    if (cubiertos.has(k)) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(m);
  }
  const out = [];
  for (const [k, ms] of grupos) {
    const meses = new Set(ms.map((m) => ym(m.fecha)));
    if (meses.size < 3) continue;
    // Un valor por mes (si hubo varios pagos en un mes, se suman: p. ej. cuotas partidas).
    const porMes = [...meses].map((p) => ms.filter((m) => ym(m.fecha) === p).reduce((a, m) => a + num(m.valor), 0)).sort((a, b) => a - b);
    const mediana = porMes[Math.floor(porMes.length / 2)];
    const variable = (porMes.at(-1) - porMes[0]) / (mediana || 1) > 0.05;
    const exactos = ms.filter((m) => !m.fechaAproximada).map((m) => Number(m.fecha.slice(8, 10)));
    const dia = exactos.length ? [...exactos].sort((a, b) => exactos.filter((x) => x === b).length - exactos.filter((x) => x === a).length)[0] : 1;
    const [conceptoId, cuentaId, tipo] = k.split("|");
    const ultimo = ms.reduce((a, m) => (m.fecha > a.fecha ? m : a));
    out.push({
      clave: k, tipo, conceptoId: Number(conceptoId), cuentaId: Number(cuentaId), itemId: ultimo.itemId, pagadorId: ultimo.pagadorId, tercero: ultimo.tercero,
      concepto: mapas.conceptos.get(Number(conceptoId))?.nombre, cuenta: mapas.cuentas.get(Number(cuentaId))?.nombre, item: ultimo.itemId ? mapas.items.get(ultimo.itemId)?.nombre : null,
      moneda: ultimo.moneda, valor: Math.round(mediana), valorTexto: fmtMoneda(mediana, ultimo.moneda), valorVariable: variable,
      diaDelMes: dia, diaExacto: exactos.length > 0, meses: meses.size,
      razon: `${meses.size} de los últimos 6 meses${variable ? `, entre ${fmtMoneda(porMes[0], ultimo.moneda)} y ${fmtMoneda(porMes.at(-1), ultimo.moneda)}` : ", siempre el mismo valor"}${exactos.length ? `, casi siempre el día ${dia}` : " (fechas solo con el mes: revisa el día)"}.`,
    });
  }
  return out.sort((a, b) => b.meses - a.meses || b.valor - a.valor);
}

// Revisión periódica (al arrancar y cada 6 horas): mantiene generados los proyectados de los próximos meses.
export function startRecurrentesTesoreria() {
  if (globalThis.__recurrentesTesoreria || process.env.TESORERIA_RECURRENTES_AUTO === "0") return;
  globalThis.__recurrentesTesoreria = true;
  const correr = () => generarProyectados().catch((e) => console.error("[tesorería recurrentes]", e.message));
  setTimeout(correr, 45 * 1000);
  setInterval(correr, 6 * 60 * 60 * 1000);
}
