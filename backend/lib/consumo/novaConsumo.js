import { prisma } from "@/lib/prisma";
import { accesoConsumo, SERVICIOS, fmtMoneda, claveNombre } from "@/lib/consumo/comun";
import { todosLosRecibos } from "@/lib/consumo/recibos";
import { recibosFaltantes, listarHallazgos } from "@/lib/consumo/agentes";

// Herramientas de Nova para Consumo (servicios públicos por sede). Solo se le ofrecen a quien tiene acceso al módulo
// (el chat lo decide con accesoConsumo) y cada llamada lo vuelve a comprobar. NO se publican en el servidor MCP.
// Son de solo lectura y devuelven cifras ya calculadas, con su moneda ISO 4217 («COP 1.234.567»).

const SERV = Object.keys(SERVICIOS);
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const r2 = (v) => Math.round(v * 100) / 100;
const fmtN = (v, d = 1) => (v == null ? null : new Intl.NumberFormat("es-CO", { maximumFractionDigits: d }).format(v));
const unidad = (s) => (SERVICIOS[s]?.unidad === "m3" ? "m³" : SERVICIOS[s]?.unidad || null);
const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export const TOOLS_CONSUMO = [
  {
    name: "resumen_consumo",
    description: "Gasto y consumo de servicios públicos (energía, acueducto y alcantarillado, gas, aseo) por sede: para «¿cuánto gastó X en energía este año?», «¿qué sede gasta más en agua?», «¿cuánto consumimos en octubre?», «compara 2025 con 2026». Filtra por sede (nombre o parte), servicio, año y mes (mes de reporte del recibo). Devuelve totales del filtro (gasto facturado, pagado, saldo pendiente, vencidos, consumo por servicio con su unidad, costo por unidad), el desglose por sede y servicio ordenado de mayor a menor gasto, y el desglose por mes. Todo calculado.",
    input_schema: { type: "object", properties: { sede: { type: "string", description: "Nombre o parte del nombre de la sede." }, servicio: { type: "string", enum: SERV }, anio: { type: "integer" }, mes: { type: "integer", description: "1-12" } } },
  },
  {
    name: "buscar_recibos_consumo",
    description: "Recibos puntuales de servicios públicos: «¿ya llegó el recibo de luz de la sede X?», «¿qué recibos están por pagar o vencidos?», «dame los recibos con lectura estimada». Filtra por sede, servicio, año, mes, estado de pago (pendiente, vencido, pagado, saldo_favor) y tipo de lectura. Devuelve como máximo 'limite' recibos (los más recientes primero), el total real y los totales del filtro.",
    input_schema: { type: "object", properties: { sede: { type: "string" }, servicio: { type: "string", enum: SERV }, anio: { type: "integer" }, mes: { type: "integer" }, pago: { type: "string", enum: ["pendiente", "vencido", "pagado", "saldo_favor"] }, lectura: { type: "string", enum: ["real", "promediada", "estimada", "no_real"] }, limite: { type: "integer", description: "Máximo 40 (por defecto 15)." } } },
  },
  {
    name: "recibos_faltantes_consumo",
    description: "Recibos que NO han llegado (agente de recibos faltantes): por cuenta activa, los períodos ya cerrados sin recibo (atrasado), los huecos entre dos recibos y las cuentas sin ningún recibo. Para «¿qué recibos faltan?», «¿falta algún recibo de la sede X?».",
    input_schema: { type: "object", properties: { sede: { type: "string" }, servicio: { type: "string", enum: SERV }, tipo: { type: "string", enum: ["atrasado", "hueco", "sin_recibos", "reemplazada"], description: "reemplazada = la cuenta dejó de recibir recibos porque otra del mismo servicio en la sede los recibe (cambio de cuenta o medidor): no es un faltante." } } },
  },
  {
    name: "hallazgos_consumo",
    description: "Hallazgos del agente de Consumo en todas las sedes (recibos vencidos, doble facturación, lecturas estimadas, consumo anormal, costo por unidad que subió, alumbrado público, factura sin detalle, crédito de conexión, titular distinto, pago de más), con su prioridad, confianza, plata en juego, qué hacer y si ya tiene reclamación (borrador o radicada). Para «¿qué problemas hay en los recibos?», «¿hay algo que reclamar?», «¿qué hallazgos tiene la sede X?».",
    input_schema: { type: "object", properties: { sede: { type: "string" }, servicio: { type: "string", enum: SERV }, estado: { type: "string", enum: ["abierto", "resuelto", "descartado", "todos"], description: "Por defecto abierto." }, nivel: { type: "string", enum: ["urgente", "alta", "media", "baja"] }, limite: { type: "integer", description: "Máximo 30 (por defecto 15)." } } },
  },
];
export const NOMBRES_CONSUMO = new Set(TOOLS_CONSUMO.map((t) => t.name));

// Sede por nombre (sin tildes ni signos; exacto primero, luego «contiene»). undefined = sin filtro; -1 = no existe.
async function sedePorNombre(texto) {
  if (!texto) return { id: undefined };
  const t = claveNombre(texto);
  const sedes = await prisma.sedeConsumo.findMany({ select: { id: true, nombre: true } });
  const s = sedes.find((x) => claveNombre(x.nombre) === t) || sedes.find((x) => claveNombre(x.nombre).includes(t));
  return s ? { id: s.id, nombre: s.nombre } : { id: -1, sugerencias: sedes.map((x) => x.nombre) };
}

function totales(l) {
  const suma = (f) => r2(l.reduce((s, r) => s + (Number(f(r)) || 0), 0));
  const consumo = {};
  for (const r of l) if (r.consumo != null && unidad(r.servicio)) consumo[r.servicio] = (consumo[r.servicio] || 0) + r.consumo;
  const gastoServ = {};
  for (const r of l) gastoServ[r.servicio] = (gastoServ[r.servicio] || 0) + r.costoServicio;
  return {
    recibos: l.length,
    gastoFacturado: fmtMoneda(suma((r) => r.totalCargos)),
    pagado: fmtMoneda(suma((r) => r.valorPagado)),
    saldoPendiente: fmtMoneda(suma((r) => r.saldo)),
    vencidos: l.filter((r) => r.vencido).length,
    consumo: Object.fromEntries(Object.entries(consumo).map(([s, v]) => [SERVICIOS[s].nombre, `${fmtN(v, 0)} ${unidad(s)}`])),
    costoPorUnidad: Object.fromEntries(Object.entries(consumo).filter(([, v]) => v > 0).map(([s, v]) => [SERVICIOS[s].nombre, `${fmtMoneda(gastoServ[s] / v)} por ${unidad(s)} (todo incluido, sin aseo)`])),
  };
}

const reciboCorto = (r) => ({
  id: r.id, sede: r.sede, servicio: SERVICIOS[r.servicio]?.nombre || r.servicio, cuenta: r.numeroCuenta, empresa: r.empresa, factura: r.numeroFactura,
  mes: r.mesTexto, periodo: r.periodo, lectura: r.tipoLectura, consumo: r.consumo != null ? `${fmtN(r.consumo, 0)} ${unidad(r.servicio) || ""}`.trim() : null,
  totalPagar: fmtMoneda(r.totalPagar, r.moneda), pagoOportuno: r.fechaPagoOportuno, estado: r.vencido ? "vencido" : r.estadoPago,
  variacionConsumo: r.varConsumo != null ? `${r.varConsumo > 0 ? "+" : ""}${fmtN(r.varConsumo * 100, 1)} % frente al recibo anterior` : null,
});

export async function ejecutarConsumo(name, args, user) {
  if (!user || !(await accesoConsumo(user))) return { error: "Esta persona no tiene acceso a Consumo." };
  const sede = await sedePorNombre(args.sede);
  if (sede.id === -1) return { error: `No hay una sede llamada «${args.sede}».`, sedesDisponibles: sede.sugerencias };
  const servicio = SERVICIOS[args.servicio] ? args.servicio : undefined;
  const filtro = (r) => (!sede.id || r.sedeId === sede.id) && (!servicio || r.servicio === servicio) && (!args.anio || r.anio === Number(args.anio)) && (!args.mes || r.mes === Number(args.mes));
  switch (name) {
    case "resumen_consumo": {
      const l = (await todosLosRecibos()).filter(filtro);
      if (!l.length) return { filtro: { sede: sede.nombre || "todas", servicio: servicio ? SERVICIOS[servicio].nombre : "todos", anio: args.anio || "todos", mes: args.mes || "todos" }, sinDatos: "No hay recibos con ese filtro." };
      const grupos = new Map();
      for (const r of l) { const k = `${r.sede}|${r.servicio}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }
      const porSedeServicio = [...grupos.values()].map((g) => ({ sede: g[0].sede, servicio: SERVICIOS[g[0].servicio]?.nombre, _gasto: g.reduce((s, r) => s + r.totalCargos, 0), ...totales(g) }))
        .sort((a, b) => b._gasto - a._gasto).slice(0, 40).map(({ _gasto, ...x }) => x);
      const meses = new Map();
      for (const r of l) { const k = `${r.anio}-${String(r.mes).padStart(2, "0")}`; if (!meses.has(k)) meses.set(k, []); meses.get(k).push(r); }
      const porMes = [...meses.entries()].sort().slice(-24).map(([k, g]) => ({ mes: `${MESES[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`, ...totales(g) }));
      return {
        filtro: { sede: sede.nombre || "todas", servicio: servicio ? SERVICIOS[servicio].nombre : "todos", anio: args.anio || "todos", mes: args.mes || "todos" },
        totales: totales(l), porSedeServicio, porMes,
        nota: "El mes es el de reporte del recibo (el del fin del período). El aseo llega dentro del recibo de energía y no suma al costo de la energía. Usa las cifras tal cual, con su código de moneda.",
      };
    }
    case "buscar_recibos_consumo": {
      const limite = Math.min(Math.max(1, Number(args.limite) || 15), 40);
      const l = (await todosLosRecibos()).filter(filtro).filter((r) =>
        (!args.pago || (args.pago === "vencido" ? r.vencido : r.estadoPago === args.pago))
        && (!args.lectura || (args.lectura === "no_real" ? r.tipoLectura === "promediada" || r.tipoLectura === "estimada" : r.tipoLectura === args.lectura)));
      return { total: l.length, totalesDelFiltro: totales(l), recibos: l.slice(0, limite).map(reciboCorto), hoy: hoyCO() };
    }
    case "recibos_faltantes_consumo": {
      const r = await recibosFaltantes({ sedeId: sede.id, servicio, tipo: args.tipo });
      return {
        cuentasRevisadas: r.cuentasRevisadas, total: r.total, porTipo: r.porTipo,
        regla: `Un recibo falta cuando ya cerró su período y pasaron ${r.graciaDias} días sin cargarlo (el largo del período sale de los recibos de la cuenta).`,
        faltantes: r.items.slice(0, 30).map((x) => ({ tipo: x.tipo, sede: x.sede, servicio: x.servicioNombre, cuenta: x.numeroCuenta, empresa: x.empresa, que: x.titulo, detalle: x.detalle, diasDeAtraso: x.diasAtraso ?? null })),
        dondeVerlo: "Consumo › Agentes › Recibos faltantes",
      };
    }
    case "hallazgos_consumo": {
      const limite = Math.min(Math.max(1, Number(args.limite) || 15), 30);
      const r = await listarHallazgos({ sedeId: sede.id, servicio, estado: args.estado || "abierto", nivel: args.nivel, size: 200 });
      return {
        total: r.total, porPrioridad: r.porNivel, porConfianza: r.porConfianza, plataEnJuego: r.enJuegoTexto,
        hallazgos: r.items.slice(0, limite).map((h) => ({
          tipo: h.tipoTexto, prioridad: h.nivelTexto, confianza: h.confianza, sede: h.sede, servicio: h.servicioNombre, que: h.titulo, queHacer: h.accion,
          enJuego: h.valorTexto, plazo: h.detalle, estado: h.estado,
          reclamacion: h.reclamacionEstado ? `${h.reclamacionEstado}${h.radicadoNumero ? ` (radicado ${h.radicadoNumero})` : ""}` : h.reclamable ? "sin redactar (Nova puede redactarla en Consumo › Agentes)" : "no aplica",
        })),
        dondeVerlo: "Consumo › Agentes › Hallazgos y Reclamaciones",
      };
    }
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}
