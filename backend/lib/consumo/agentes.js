import { prisma } from "@/lib/prisma";
import { logConsumo } from "@/lib/audit";
import { coincide } from "@/lib/buscarTexto";
import { todosLosRecibos } from "@/lib/consumo/recibos";
import { auditoria } from "@/lib/consumo/analisis";
import { SERVICIOS, fmtMoneda, badRequest, notFound, limpiar } from "@/lib/consumo/comun";

// Agentes de Consumo. Todo lo calcula el CÓDIGO con los recibos guardados (sin IA):
//   recibosFaltantes()  → agente 1: cuentas activas a las que les falta el recibo de un período (atrasado o un hueco).
//                         Se calcula al vuelo, no se guarda.
//   revisarHallazgos()  → agente 4: corre la auditoría del contador (analisis.js#auditoria) en TODAS las sedes y
//                         servicios, le suma anomalías de consumo y de costo por unidad, y guarda cada hallazgo una sola
//                         vez (HallazgoConsumo.clave). Si deja de cumplirse, lo cierra solo. Corre al pedirlo, después de
//                         cada cambio en un recibo (solo esa sede y servicio) y, si hace más de 6 horas, al consultarlos.
// La reclamación de un hallazgo (agente 5) está en reclamaciones.js; las herramientas de Nova (6) en novaConsumo.js.

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const masDias = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const masMeses = (f, n) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const mesDe = (f) => `${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const fmtN = (v, d = 1) => (v == null ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: d }).format(v));
const fmtP = (v) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtN(Math.abs(v) * 100, 1)} %`);
const promedio = (l) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : null);
const desviacion = (l) => { const m = promedio(l); return l.length > 1 ? Math.sqrt(l.reduce((s, x) => s + (x - m) ** 2, 0) / (l.length - 1)) : 0; };
const mediana = (l) => { if (!l.length) return null; const o = [...l].sort((a, b) => a - b); const m = Math.floor(o.length / 2); return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; };
const etiqueta = (r) => `${MESES[r.mes - 1]} ${r.anio}`;
const unidadDe = (servicio) => (SERVICIOS[servicio]?.unidad === "m3" ? "m³" : SERVICIOS[servicio]?.unidad || "");
const esReal = (r) => r.tipoLectura === "real";

// Días que normalmente tarda en llegar el recibo después de cerrar el período (expedición + reparto).
export const GRACIA_DIAS = 20;
const NOMBRE_AGENTE = "Nova · agente de hallazgos";

// ---------- Agente 1: recibos faltantes ----------

// Cada cuenta activa (que no sea «no aplica», de una sede activa) debe tener un recibo por período. Faltan:
//   «atrasado»: después del último recibo ya cerró al menos un período y pasaron GRACIA_DIAS sin que llegara el recibo.
//   «hueco»: entre dos recibos quedaron días sin cubrir (medio período o más).
//   «sin_recibos»: la cuenta no tiene ningún recibo todavía.
// El largo del período sale de los recibos de la cuenta (mediana de sus días); sin datos, de la periodicidad.
export async function recibosFaltantes({ sedeId, servicio, tipo, q, precargados } = {}) {
  const hoy = hoyCO();
  const cuentas = await prisma.cuentaConsumo.findMany({
    where: { activo: true, noAplica: false, sede: { activo: true }, ...(sedeId ? { sedeId: Number(sedeId) } : {}), ...(servicio ? { servicio } : {}) },
    include: { sede: { select: { id: true, nombre: true } }, empresa: { select: { nombre: true } } },
  });
  const todos = precargados || await todosLosRecibos();
  const porCuenta = new Map();
  for (const r of todos) { if (!porCuenta.has(r.cuentaId)) porCuenta.set(r.cuentaId, []); porCuenta.get(r.cuentaId).push(r); }

  const items = [];
  for (const c of cuentas) {
    const base = { cuentaId: c.id, sedeId: c.sedeId, sede: c.sede.nombre, servicio: c.servicio, servicioNombre: SERVICIOS[c.servicio]?.nombre || c.servicio, numeroCuenta: c.numeroCuenta, empresa: c.empresa?.nombre || null, periodicidad: c.periodicidad };
    const l = (porCuenta.get(c.id) || []).slice().sort((a, b) => a.periodoHasta.localeCompare(b.periodoHasta));
    if (!l.length) {
      items.push({ ...base, id: `${c.id}-sin`, tipo: "sin_recibos", nivel: "info", periodos: null, desde: null, hasta: null, titulo: `${c.sede.nombre} · ${base.servicioNombre}: la cuenta ${c.numeroCuenta || "sin número"} no tiene recibos`, detalle: "Sube el último recibo para empezar a controlar esta cuenta, o márcala como «no aplica» en Sedes y cuentas si la sede no tiene este servicio." });
      continue;
    }
    const largos = l.map((r) => r.dias || diasEntre(r.periodoDesde, r.periodoHasta) + 1).filter((n) => n >= 20 && n <= 75);
    const largo = Math.round(mediana(largos) || (c.periodicidad === "bimestral" ? 60 : 30));
    // Huecos entre recibos consecutivos.
    for (let i = 1; i < l.length; i++) {
      const sinCubrir = diasEntre(l[i - 1].periodoHasta, l[i].periodoDesde) - 1;
      if (sinCubrir < largo * 0.5) continue;
      const n = Math.max(1, Math.round(sinCubrir / largo));
      const desde = masDias(l[i - 1].periodoHasta, 1); const hasta = masDias(l[i].periodoDesde, -1);
      items.push({ ...base, id: `${c.id}-h-${desde}`, tipo: "hueco", nivel: diasEntre(hasta, hoy) > 365 ? "info" : "atencion", periodos: n, desde, hasta, dias: sinCubrir,
        titulo: `${c.sede.nombre} · ${base.servicioNombre}: falta${n > 1 ? `n ${n} recibos` : " el recibo"} entre ${etiqueta(l[i - 1])} y ${etiqueta(l[i])}`,
        detalle: `Del ${desde} al ${hasta} (${sinCubrir} días) no hay recibo de la cuenta ${c.numeroCuenta || ""}. Búscalo en el correo o pídelo a ${base.empresa || "la empresa"}.` });
    }
    // Después del último recibo.
    const ultimo = l[l.length - 1];
    const desdeUltimo = diasEntre(ultimo.periodoHasta, hoy);
    const n = Math.floor((desdeUltimo - GRACIA_DIAS) / largo);
    // Otra cuenta del mismo servicio en la sede siguió recibiendo recibos después: esta se reemplazó (cambio de cuenta o
    // de medidor, como Mesa de Yeguas). No es un recibo faltante; solo se sugiere desactivarla.
    const sucesora = n >= 1 ? todos.filter((r) => r.sedeId === c.sedeId && r.servicio === c.servicio && r.cuentaId !== c.id && r.periodoDesde > ultimo.periodoHasta).sort((a, b) => b.periodoHasta.localeCompare(a.periodoHasta))[0] : null;
    if (sucesora) {
      items.push({ ...base, id: `${c.id}-r`, tipo: "reemplazada", nivel: "info", periodos: null, desde: masDias(ultimo.periodoHasta, 1), hasta: null,
        titulo: `${c.sede.nombre} · ${base.servicioNombre}: la cuenta ${c.numeroCuenta || ""} no recibe recibos desde ${etiqueta(ultimo)}`,
        detalle: `Los recibos siguen llegando a la cuenta ${sucesora.numeroCuenta || ""} (el último, de ${etiqueta(sucesora)}). Si la cuenta ${c.numeroCuenta || ""} ya no se usa, desactívala en Sedes y cuentas para que no se espere su recibo.` });
    } else if (n >= 1) {
      const atraso = desdeUltimo - largo - GRACIA_DIAS;
      const meses = Array.from({ length: Math.min(n, 12) }, (_, k) => mesDe(masDias(ultimo.periodoHasta, largo * (k + 1))));
      items.push({ ...base, id: `${c.id}-a`, tipo: "atrasado", nivel: n >= 2 || atraso > 30 ? "critico" : "atencion", periodos: n, desde: masDias(ultimo.periodoHasta, 1), hasta: masDias(ultimo.periodoHasta, largo * n), diasAtraso: atraso,
        ultimo: { id: ultimo.id, mes: etiqueta(ultimo), periodoHasta: ultimo.periodoHasta },
        titulo: `${c.sede.nombre} · ${base.servicioNombre}: falta${n > 1 ? `n ${n} recibos` : " el recibo"} (${meses.join(", ")}${n > 12 ? "…" : ""})`,
        detalle: `El último recibo es de ${etiqueta(ultimo)} (cerró el ${ultimo.periodoHasta}). Con períodos de ${largo} días, el siguiente debió llegar hace ${atraso} día(s). Revisa el correo o el portal de ${base.empresa || "la empresa"}: un recibo que no llega se vence sin aviso.` });
    }
  }
  const orden = { atrasado: 0, hueco: 1, sin_recibos: 2, reemplazada: 3 };
  const nivelOrden = { critico: 0, atencion: 1, info: 2 };
  const filtrados = items.filter((x) => (!tipo || x.tipo === tipo) && coincide(q, x.sede, x.numeroCuenta, x.empresa, x.servicioNombre));
  filtrados.sort((a, b) => nivelOrden[a.nivel] - nivelOrden[b.nivel] || orden[a.tipo] - orden[b.tipo] || (b.diasAtraso || 0) - (a.diasAtraso || 0) || a.sede.localeCompare(b.sede));
  return {
    items: filtrados, total: filtrados.length,
    porTipo: Object.fromEntries(Object.keys(orden).map((k) => [k, items.filter((x) => x.tipo === k).length])),
    cuentasRevisadas: cuentas.length, graciaDias: GRACIA_DIAS, hoy,
  };
}

// ---------- Agente 4: hallazgos en todas las sedes ----------

const PRIORIDAD_A_NIVEL = { URGENTE: "urgente", ALTA: "alta", MEDIA: "media", BAJA: "baja" };
export const NIVELES_HALLAZGO = { urgente: "Urgente", alta: "Alta", media: "Media", baja: "Baja" };
export const TIPOS_HALLAZGO = {
  vencido: "Recibo vencido", doble_cobro: "Doble facturación", lectura_estimada: "Lectura estimada", consumo_alto: "Consumo anormal",
  costo_unidad: "Costo por unidad", alumbrado: "Alumbrado público", sin_factura: "Sin factura detallada", credito: "Crédito de conexión",
  titular: "Titular distinto", pago_de_mas: "Pago de más",
};

// Anomalías que la hoja del contador no tiene: el consumo por día y el costo por unidad de cada recibo del último año
// frente al promedio de los (hasta 6) recibos anteriores de la misma sede y servicio. La confianza depende de cuántos
// recibos anteriores hay y de qué tan grande es la diferencia.
function anomalias(l, servicio) {
  const u = unidadDe(servicio);
  const hace = masMeses(hoyCO(), -12);
  const out = [];
  l.forEach((r, i) => {
    if (r.periodoHasta < hace) return;
    if (esReal(r) && r.consumoDia != null) {
      const previos = l.slice(0, i).filter((x) => esReal(x) && x.consumoDia != null).slice(-6).map((x) => x.consumoDia);
      const prom = promedio(previos);
      if (previos.length >= 3 && prom > 0) {
        const v = r.consumoDia / prom - 1;
        if (v >= 0.3 && r.consumoDia - prom > 2 * desviacion(previos)) {
          out.push({
            tipo: "consumo_alto", id: `r${r.id}`, reciboId: r.id, nivel: v >= 0.6 ? "alta" : "media",
            confianza: previos.length >= 5 && v >= 0.6 ? "alta" : previos.length >= 4 ? "media" : "baja",
            valor: r.costoUnidad != null && r.dias ? r2((r.consumoDia - prom) * r.dias * r.costoUnidad) : null,
            titulo: `Consumo de ${etiqueta(r)} ${fmtP(v)} sobre lo normal: ${fmtN(r.consumoDia)} ${u}/día frente a ${fmtN(prom)} ${u}/día de los ${previos.length} recibos anteriores.`,
            accion: "Confirmar si hubo más uso (obras, eventos, más personal) o una fuga o daño. Si no hay explicación, pedir a la empresa la revisión del medidor y la reliquidación.",
          });
        }
      }
    }
    if (r.costoUnidad != null && r.consumo > 0) {
      const previos = l.slice(0, i).filter((x) => x.costoUnidad != null && x.consumo > 0).slice(-6).map((x) => x.costoUnidad);
      const prom = promedio(previos);
      if (previos.length >= 3 && prom > 0) {
        const v = r.costoUnidad / prom - 1;
        if (v >= 0.2) {
          out.push({
            tipo: "costo_unidad", id: `r${r.id}`, reciboId: r.id, nivel: v >= 0.4 ? "alta" : "media",
            confianza: previos.length >= 5 && v >= 0.4 ? "alta" : previos.length >= 4 ? "media" : "baja",
            valor: r2((r.costoUnidad - prom) * r.consumo),
            titulo: `En ${etiqueta(r)} cada ${u} costó ${fmtP(v)} más: ${fmtMoneda(r.costoUnidad, r.moneda)} frente a ${fmtMoneda(prom, r.moneda)} de los ${previos.length} recibos anteriores (todo incluido).`,
            accion: "Comparar la tarifa y los otros cargos con los recibos anteriores: cambio de estrato o clase de uso, contribución, alumbrado, intereses o cobros nuevos.",
          });
        }
      }
    }
  });
  return out;
}

// Hallazgos de UNA sede y servicio, con su clave. La lectura estimada se separa por recibo (cada uno se reclama aparte).
async function calcularPar(todos, sedeId, servicio) {
  const a = await auditoria({ sedeId, servicio }, todos);
  if (a.vacio) return [];
  const u = unidadDe(servicio);
  const out = [];
  for (const h of a.hallazgos) {
    if (!PRIORIDAD_A_NIVEL[h.prioridad]) continue; // lo INFORMATIVO se queda en la auditoría
    if (h.tipo === "lectura_estimada") {
      for (const p of h.porRecibo || []) {
        const plazo = p.fechaExpedicion ? masMeses(p.fechaExpedicion, 5) : null;
        out.push({
          tipo: "lectura_estimada", id: `r${p.reciboId}`, reciboId: p.reciboId, nivel: "media", confianza: "alta", valor: p.total,
          titulo: `Recibo de ${p.mes.replace(" (est.)", "")} (cuenta ${p.cuenta}) con lectura ${p.tipoLectura}: se cobraron ${fmtN(p.consumo, 0)} ${u} sin leer el medidor.`,
          accion: `Pedir la lectura real del medidor y, si el consumo estimado fue mayor, la reliquidación${plazo ? ` (reclamar antes del ${plazo})` : ""}.`,
          plazoReclamo: plazo,
        });
      }
      continue;
    }
    out.push({ tipo: h.tipo, id: h.id, reciboId: h.reciboId || null, nivel: PRIORIDAD_A_NIVEL[h.prioridad], confianza: h.confianza || "media", valor: h.valor ?? null, titulo: h.titulo, accion: h.accion, plazoReclamo: h.plazoReclamo || null });
  }
  const lista = todos.filter((r) => r.sedeId === sedeId && r.servicio === servicio).sort((x, y) => x.periodoHasta.localeCompare(y.periodoHasta) || x.id - y.id);
  out.push(...anomalias(lista, servicio));
  // Un mismo recibo con consumo alto Y doble cobro: se deja el doble cobro (lo explica mejor).
  const dobles = new Set(out.filter((h) => h.tipo === "doble_cobro").map((h) => h.reciboId));
  return out.filter((h) => !(h.tipo === "consumo_alto" && dobles.has(h.reciboId))).map((h) => ({ ...h, sedeId, servicio, clave: `${h.tipo}|s${sedeId}|${servicio}|${h.id}` }));
}

let ultimaRevisionTotal = 0;
const REVISAR_CADA_MS = 6 * 3600 * 1000;

// Revisa todas las sedes (o solo una sede y servicio) y sincroniza la tabla de hallazgos. actor = la persona que lo
// pidió (o la que cambió el recibo); null = revisión automática.
export async function revisarHallazgos(actor, { sedeId, servicio, origen = "manual" } = {}) {
  const todos = await todosLosRecibos();
  const pares = new Map();
  for (const r of todos) {
    if (r.servicio === "aseo" || !SERVICIOS[r.servicio]) continue;
    if (sedeId && r.sedeId !== Number(sedeId)) continue;
    if (servicio && r.servicio !== servicio) continue;
    pares.set(`${r.sedeId}|${r.servicio}`, { sedeId: r.sedeId, servicio: r.servicio });
  }
  const encontrados = [];
  for (const p of pares.values()) encontrados.push(...(await calcularPar(todos, p.sedeId, p.servicio)));

  const ahora = new Date();
  const alcance = { clave: { not: null }, ...(sedeId ? { sedeId: Number(sedeId) } : {}), ...(servicio ? { servicio } : {}) };
  const existentes = await prisma.hallazgoConsumo.findMany({ where: alcance });
  const porClave = new Map(existentes.map((h) => [h.clave, h]));
  const vistas = new Set();
  let nuevos = 0, actualizados = 0, reabiertos = 0, cerrados = 0;
  for (const h of encontrados) {
    if (vistas.has(h.clave)) continue;
    vistas.add(h.clave);
    const datos = {
      tipo: h.tipo, nivel: h.nivel, sedeId: h.sedeId, servicio: h.servicio, reciboId: h.reciboId,
      titulo: limpiar(h.titulo, 1000), accion: limpiar(h.accion, 2000), detalle: h.plazoReclamo ? `Plazo para reclamar: ${h.plazoReclamo}` : null,
      valor: h.valor != null && Number.isFinite(h.valor) ? r2(Math.abs(h.valor)) : null, confianza: h.confianza, actualizadoAt: ahora,
    };
    const ex = porClave.get(h.clave);
    try {
      if (!ex) {
        await prisma.hallazgoConsumo.create({ data: { ...datos, clave: h.clave, creadoPorUserId: actor?.id || null, creadoPorNombre: NOMBRE_AGENTE } });
        nuevos++;
      } else if (ex.estado === "abierto") {
        await prisma.hallazgoConsumo.update({ where: { id: ex.id }, data: datos });
        actualizados++;
      } else if (ex.resueltoPorNombre === `${NOMBRE_AGENTE}: ya no aplica`) {
        // Lo había cerrado el agente y volvió a aparecer: se reabre. Lo que cerró una persona no se toca.
        await prisma.hallazgoConsumo.update({ where: { id: ex.id }, data: { ...datos, estado: "abierto", resueltoAt: null, resueltoPorUserId: null, resueltoPorNombre: null, nota: null } });
        reabiertos++;
      } else {
        await prisma.hallazgoConsumo.update({ where: { id: ex.id }, data: { actualizadoAt: ahora } });
      }
    } catch (e) {
      if (e?.code !== "P2002") throw e; // otra revisión lo creó al mismo tiempo
    }
  }
  // Los abiertos que esta revisión ya no encontró (se pagó, se corrigió el recibo…) se cierran solos.
  const parEvaluado = (h) => pares.has(`${h.sedeId}|${h.servicio}`) || (!sedeId && !servicio);
  for (const ex of existentes.filter((h) => h.estado === "abierto" && !vistas.has(h.clave) && parEvaluado(h))) {
    await prisma.hallazgoConsumo.update({ where: { id: ex.id }, data: { estado: "resuelto", resueltoAt: ahora, resueltoPorUserId: null, resueltoPorNombre: `${NOMBRE_AGENTE}: ya no aplica`, nota: `La revisión del ${hoyCO()} ya no lo encontró (por ejemplo, el recibo se pagó o se corrigió).` } });
    cerrados++;
  }
  if (!sedeId && !servicio) ultimaRevisionTotal = Date.now();
  const resumen = { revisadas: pares.size, encontrados: vistas.size, nuevos, actualizados, reabiertos, cerrados, origen };
  if (nuevos || cerrados || reabiertos || origen === "manual") {
    logConsumo(actor, {
      action: "revisar", entityType: "agenteHallazgosConsumo", recordId: sedeId ? `s${sedeId}` : "todas",
      recordInfo: `Agente de hallazgos (${origen === "manual" ? "a pedido" : origen === "recibo" ? "tras un cambio en un recibo" : "automático"}): ${nuevos} nuevo(s), ${reabiertos} reabierto(s), ${cerrados} cerrado(s)`,
      after: { alcance: sedeId ? `Sede ${sedeId}${servicio ? ` · ${servicio}` : ""}` : "Todas las sedes", revisadas: pares.size, nuevos, reabiertos, cerrados },
    }).catch(() => {});
  }
  return resumen;
}

// Revisión completa si la última fue hace más de 6 horas (lo vencido cambia con la fecha aunque nadie toque nada).
export async function revisarSiHaceFalta() {
  if (Date.now() - ultimaRevisionTotal < REVISAR_CADA_MS) return null;
  ultimaRevisionTotal = Date.now(); // evita dos revisiones simultáneas
  try { return await revisarHallazgos(null, { origen: "automatico" }); } catch { ultimaRevisionTotal = 0; return null; }
}

// Después de crear, editar, pagar o borrar un recibo: revisa solo esa sede y servicio (agrupado: varias escrituras
// seguidas, una sola revisión). Nunca bloquea ni hace fallar la escritura.
const pendientes = new Map();
export function revisarTrasCambio(actor, sedeId, servicio) {
  if (!sedeId || !servicio || servicio === "aseo") return;
  const k = `${sedeId}|${servicio}`;
  clearTimeout(pendientes.get(k));
  pendientes.set(k, setTimeout(() => { pendientes.delete(k); revisarHallazgos(actor, { sedeId, servicio, origen: "recibo" }).catch(() => {}); }, 2500));
}

// ---------- Consulta y resolución ----------

const parseJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
export const RECLAMABLES = new Set(["doble_cobro", "lectura_estimada", "consumo_alto", "costo_unidad", "alumbrado", "sin_factura", "credito", "titular", "pago_de_mas"]);

function aCliente(h) {
  const r = h.recibo;
  return {
    id: h.id, tipo: h.tipo, tipoTexto: TIPOS_HALLAZGO[h.tipo] || h.tipo, nivel: h.nivel, nivelTexto: NIVELES_HALLAZGO[h.nivel] || h.nivel, confianza: h.confianza,
    sedeId: h.sedeId, sede: h.sede?.nombre || null, servicio: h.servicio, servicioNombre: SERVICIOS[h.servicio]?.nombre || h.servicio,
    reciboId: h.reciboId, recibo: r ? { id: r.id, mes: `${MESES[r.mes - 1]} ${r.anio}`, numeroFactura: r.numeroFactura, numeroCuenta: r.cuenta?.numeroCuenta, empresa: r.cuenta?.empresa?.nombre || null, totalPagar: Number(r.totalPagar), moneda: r.moneda } : null,
    titulo: h.titulo, accion: h.accion, detalle: h.detalle, valor: h.valor == null ? null : Number(h.valor), moneda: h.moneda, valorTexto: h.valor == null ? null : fmtMoneda(h.valor, h.moneda),
    estado: h.estado, nota: h.nota, resueltoAt: h.resueltoAt, resueltoPorNombre: h.resueltoPorNombre,
    createdAt: h.createdAt, creadoPorNombre: h.creadoPorNombre, actualizadoAt: h.actualizadoAt,
    reclamable: RECLAMABLES.has(h.tipo),
    reclamacion: parseJson(h.reclamacion), reclamacionEstado: h.reclamacionEstado, reclamacionAt: h.reclamacionAt, reclamacionPorNombre: h.reclamacionPorNombre, radicadaAt: h.radicadaAt, radicadoNumero: h.radicadoNumero,
  };
}
const incluirHallazgo = { sede: { select: { nombre: true } }, recibo: { select: { id: true, anio: true, mes: true, numeroFactura: true, totalPagar: true, moneda: true, cuenta: { select: { numeroCuenta: true, empresa: { select: { nombre: true } } } } } } };
const ORDEN_NIVEL = { urgente: 0, alta: 1, media: 2, baja: 3 };
const ORDEN_CONF = { alta: 0, media: 1, baja: 2 };

// estado: abierto (por defecto) | resuelto | descartado | todos. reclamacion: con | borrador | radicada | sin.
// reclamables=1: solo los tipos que se pueden reclamar (pestaña Reclamaciones).
export async function listarHallazgos({ estado = "abierto", nivel, confianza, sedeId, servicio, tipo, reclamacion, reclamables, q, page = 1, size = 25 } = {}) {
  await revisarSiHaceFalta();
  const where = {
    clave: { not: null },
    ...(estado && estado !== "todos" ? { estado } : {}),
    ...(sedeId ? { sedeId: Number(sedeId) } : {}), ...(servicio ? { servicio } : {}),
    ...(tipo ? { tipo } : reclamables && String(reclamables) !== "0" ? { tipo: { in: [...RECLAMABLES] } } : {}),
    ...(reclamacion === "con" ? { reclamacion: { not: null } } : reclamacion === "sin" ? { reclamacion: null } : reclamacion ? { reclamacionEstado: reclamacion } : {}),
  };
  const filas = (await prisma.hallazgoConsumo.findMany({ where, include: incluirHallazgo })).map(aCliente)
    .filter((h) => coincide(q, h.titulo, h.accion, h.sede, h.recibo?.numeroCuenta, h.recibo?.numeroFactura, h.tipoTexto, h.recibo?.empresa));
  const porConfianza = { alta: 0, media: 0, baja: 0 };
  const porNivel = { urgente: 0, alta: 0, media: 0, baja: 0 };
  for (const h of filas) { if (h.confianza in porConfianza) porConfianza[h.confianza]++; if (h.nivel in porNivel) porNivel[h.nivel]++; }
  const filtradas = filas.filter((h) => (!nivel || h.nivel === nivel) && (!confianza || h.confianza === confianza));
  filtradas.sort((a, b) => (ORDEN_NIVEL[a.nivel] ?? 9) - (ORDEN_NIVEL[b.nivel] ?? 9) || (ORDEN_CONF[a.confianza] ?? 9) - (ORDEN_CONF[b.confianza] ?? 9) || (b.valor || 0) - (a.valor || 0) || b.id - a.id);
  const tam = Math.min(Math.max(Number(size) || 25, 1), 200);
  const paginas = Math.max(1, Math.ceil(filtradas.length / tam));
  const pag = Math.min(Math.max(Number(page) || 1, 1), paginas);
  const enJuego = filtradas.reduce((s, h) => s + (h.valor || 0), 0);
  const conteoEstados = await prisma.hallazgoConsumo.groupBy({ by: ["estado"], where: { clave: { not: null } }, _count: { _all: true } });
  return {
    items: filtradas.slice((pag - 1) * tam, pag * tam), total: filtradas.length, page: pag, size: tam,
    porConfianza, porNivel, enJuego: r2(enJuego), enJuegoTexto: fmtMoneda(enJuego),
    porEstado: Object.fromEntries(conteoEstados.map((x) => [x.estado, x._count._all])),
    ultimaRevision: ultimaRevisionTotal ? new Date(ultimaRevisionTotal).toISOString() : null,
  };
}

export async function obtenerHallazgo(id) {
  const h = await prisma.hallazgoConsumo.findUnique({ where: { id: Number(id) || 0 }, include: incluirHallazgo });
  if (!h || !h.clave) throw notFound("El hallazgo no existe.");
  return aCliente(h);
}

const paraAuditoria = (h) => ({ estado: h.estado, nota: h.nota || null, titulo: h.titulo });

// accion: resolver | descartar | reabrir. La nota explica qué se hizo (al descartar es obligatoria).
export async function resolverHallazgo(actor, id, { accion, nota } = {}) {
  const antes = await obtenerHallazgo(id);
  const textoNota = limpiar(nota, 1000);
  let data;
  if (accion === "resolver" || accion === "descartar") {
    if (antes.estado !== "abierto") throw badRequest("Este hallazgo ya está cerrado.");
    if (accion === "descartar" && !textoNota) throw badRequest("Escribe por qué lo descartas: queda en la auditoría.");
    data = { estado: accion === "resolver" ? "resuelto" : "descartado", resueltoAt: new Date(), resueltoPorUserId: actor?.id || null, resueltoPorNombre: actor?.nombre || null, nota: textoNota };
  } else if (accion === "reabrir") {
    if (antes.estado === "abierto") throw badRequest("Este hallazgo ya está abierto.");
    data = { estado: "abierto", resueltoAt: null, resueltoPorUserId: null, resueltoPorNombre: null, nota: textoNota };
  } else {
    throw badRequest("Acción no válida: usa resolver, descartar o reabrir.");
  }
  await prisma.hallazgoConsumo.update({ where: { id: antes.id }, data });
  const despues = await obtenerHallazgo(antes.id);
  logConsumo(actor, { action: "editar", entityType: "hallazgoConsumo", recordId: antes.id, recordInfo: `${antes.tipoTexto} · ${antes.sede} · ${antes.titulo.slice(0, 120)}`, before: paraAuditoria(antes), after: paraAuditoria(despues) }).catch(() => {});
  return despues;
}

// ---------- Mi día (lib/pendientes.js) ----------

// Recibos que no han llegado: los atrasados y los huecos recientes (los de hace más de un año quedan solo en Agentes).
export async function itemsRecibosFaltantes() {
  const { items } = await recibosFaltantes();
  return items.filter((x) => x.tipo !== "sin_recibos" && x.nivel !== "info").slice(0, 200).map((x) => ({
    id: `confal-${x.id}`, ref: x.servicioNombre, titulo: x.titulo, contexto: `${x.sede} · cuenta ${x.numeroCuenta || "—"}${x.empresa ? ` · ${x.empresa}` : ""}`,
    dias: x.tipo === "atrasado" ? x.diasAtraso : null, dato: x.tipo === "hueco" ? `${x.periodos} período(s)` : null,
    detalle: x.detalle, nivel: x.nivel, href: `/consumo/agentes?agente=faltantes`, mio: false,
  }));
}

// Hallazgos abiertos urgentes y de prioridad alta.
export async function itemsHallazgosAltos() {
  await revisarSiHaceFalta();
  const filas = await prisma.hallazgoConsumo.findMany({ where: { clave: { not: null }, estado: "abierto", nivel: { in: ["urgente", "alta"] } }, include: incluirHallazgo, take: 200 });
  return filas.map(aCliente).sort((a, b) => (ORDEN_NIVEL[a.nivel] ?? 9) - (ORDEN_NIVEL[b.nivel] ?? 9) || (b.valor || 0) - (a.valor || 0)).map((h) => ({
    id: `conhal-${h.id}`, ref: h.tipoTexto, titulo: h.titulo, contexto: `${h.sede} · ${h.servicioNombre}${h.valorTexto ? ` · ${h.valorTexto} en juego` : ""}`,
    dias: Math.max(0, Math.floor((Date.now() - new Date(h.createdAt).getTime()) / 86400000)),
    detalle: h.reclamacionEstado === "radicada" ? `Reclamación radicada${h.radicadoNumero ? ` (${h.radicadoNumero})` : ""}: espera la respuesta (15 días hábiles).` : h.accion,
    nivel: h.nivel === "urgente" ? "critico" : "atencion", href: `/consumo/agentes?agente=hallazgos&id=${h.id}`, mio: false,
  }));
}