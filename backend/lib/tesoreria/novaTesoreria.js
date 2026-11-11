import { prisma } from "@/lib/prisma";
import { accesoDe, sinTildes } from "@/lib/tesoreria/comun";
import { resumenTesoreria } from "@/lib/tesoreria/resumen";
import { listPagos } from "@/lib/tesoreria/pagos";
import { listMovimientos } from "@/lib/tesoreria/movimientos";
import { reporteSaldos } from "@/lib/tesoreria/saldos";
import { agendaPagos, estadoDePago, reporteBanco, saldosConEstado, soportesDePago } from "@/lib/tesoreria/consultas";
import { rangoTesoreria, PERIODOS_TESORERIA } from "@/lib/tesoreria/periodos";

// Herramientas de Nova para Tesorería. Solo se le ofrecen a quien tiene acceso al módulo (el chat lo decide con
// accesoDe) y cada llamada lo vuelve a comprobar. NO se publican en el servidor MCP de Claude. Son de solo lectura y
// devuelven cifras ya calculadas, con su moneda ISO 4217.

export const TOOLS_TESORERIA = [
  {
    name: "agenda_pagos_tesoreria",
    description: "LA HERRAMIENTA PARA PREGUNTAS DE FECHAS sobre pagos programados: «¿qué pagos tengo pendientes?», «¿qué tengo que pagar hoy / mañana / esta semana / la próxima semana / este mes?», «¿qué se pagó la semana pasada?», «¿qué falta por pagar este mes?», «¿qué viene en los próximos 15 días?». Las fechas las calcula el servidor (no hagas cuentas de fechas). Devuelve los pagos con su estado (P pendiente, P vencido hace N días, E pagado), vencimiento, concepto, ítem, medio de pago, quién paga y valor, más los totales por pagar, por recibir, pagado y recibido del período. Para «¿qué tengo pendiente?» sin período usa UNA sola consulta: periodo pendientes_al_fin_de_mes con estado pendientes (trae separado lo vencido y lo que está por vencer; no sumes dos consultas que se cruzan). Para «¿qué se pagó…?» usa estado pagados (va por el día en que se pagó).",
    input_schema: { type: "object", properties: { periodo: { type: "string", enum: Object.keys(PERIODOS_TESORERIA), description: "Período calculado en el servidor con la fecha de hoy en Colombia: " + Object.entries(PERIODOS_TESORERIA).map(([k, v]) => k + " = " + v).join("; ") + ". Con rango usa desde/hasta; con proximos_n_dias o ultimos_n_dias usa dias." }, desde: { type: "string", description: "AAAA-MM-DD (solo con periodo rango)." }, hasta: { type: "string", description: "AAAA-MM-DD (solo con periodo rango)." }, dias: { type: "integer" }, estado: { type: "string", enum: ["pendientes", "pagados", "todos"], description: "pendientes = P, pagados = E." }, sentido: { type: "string", enum: ["egresos", "ingresos", "todos"], description: "egresos = lo que sale (pagos), ingresos = lo que entra." }, texto: { type: "string", description: "Palabras del concepto, ítem, observación, medio o quién paga (p. ej. «gas Bahía», «arriendo»)." }, item: { type: "string", description: "Ítem/propiedad (Bahía, La Colina…)." }, medio: { type: "string", description: "Medio de pago o banco con que se paga." }, segun: { type: "string", enum: ["vencimiento", "pago"], description: "vencimiento = por la fecha en que vence (lo que hay que pagar); pago = por el día en que se pagó (lo que se pagó). Con estado pagados va por pago." }, limite: { type: "integer" } } },
  },
  {
    name: "estado_pago_tesoreria",
    description: "«¿Ya se pagó el gas de Bahía?», «¿pagaron la administración de La Colina?», «¿cuándo se pagó X?». Busca los pagos programados que coinciden con el texto alrededor de hoy (o en el período que se pida) y dice para cada uno si está pagado (E) o pendiente (P/vencido), con qué movimiento del banco se pagó (fecha, banco, valor) y si tiene soporte (con su enlace). Si no hay pago programado con ese texto, devuelve movimientos del banco parecidos.",
    input_schema: { type: "object", properties: { texto: { type: "string", description: "Qué pago (concepto, ítem, tercero…), SIN el mes." }, mes: { type: "integer", description: "Si la persona dice de qué mes es el pago («la administración de octubre»), el mes 1-12: se buscan los pagos de ESE mes (el pago de octubre vence en octubre)." }, anio: { type: "integer", description: "Año del mes (por defecto el actual)." }, periodo: { type: "string", enum: Object.keys(PERIODOS_TESORERIA), description: "Período calculado en el servidor con la fecha de hoy en Colombia: " + Object.entries(PERIODOS_TESORERIA).map(([k, v]) => k + " = " + v).join("; ") + ". Con rango usa desde/hasta; con proximos_n_dias o ultimos_n_dias usa dias." }, desde: { type: "string", description: "AAAA-MM-DD (solo con periodo rango)." }, hasta: { type: "string", description: "AAAA-MM-DD (solo con periodo rango)." }, dias: { type: "integer" } }, required: ["texto"] },
  },
  {
    name: "reporte_banco_tesoreria",
    description: "Reporte de UN banco o cuenta en un período: cuánto salió y cuánto entró, el neto, por mes, en qué se fue la plata (agrupado), los movimientos más grandes y el saldo al empezar y al terminar, diciendo si ese saldo está CONFIRMADO por un extracto o es una estimación. Para «¿cuánto ha salido de AV Villas hasta hoy / este año / este mes?», «dame el detalle de la cuenta X», «¿cuánto entró a Credicorp en octubre?». Por defecto el período es anio_hasta_hoy.",
    input_schema: { type: "object", properties: { banco: { type: "string", description: "Nombre o parte del nombre del banco/cuenta." }, periodo: { type: "string", enum: Object.keys(PERIODOS_TESORERIA), description: "Período calculado en el servidor con la fecha de hoy en Colombia: " + Object.entries(PERIODOS_TESORERIA).map(([k, v]) => k + " = " + v).join("; ") + ". Con rango usa desde/hasta; con proximos_n_dias o ultimos_n_dias usa dias." }, desde: { type: "string", description: "AAAA-MM-DD (solo con periodo rango)." }, hasta: { type: "string", description: "AAAA-MM-DD (solo con periodo rango)." }, dias: { type: "integer" } }, required: ["banco"] },
  },
  {
    name: "saldos_hoy_tesoreria",
    description: "Saldo de hoy de cada banco y el total en bancos, diciendo de cada uno si está confirmado con el extracto del último mes o si es solo una estimación (saldo inicial ± movimientos registrados) porque falta el extracto. Úsala para «¿cuánta plata tengo?», «¿cuál es el saldo de X?».",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "soporte_pago_tesoreria",
    description: "Soportes (comprobantes, recibos) de un pago: los archivos subidos a los movimientos del banco con que se pagó. Entrégalos SIEMPRE como enlaces Markdown [nombre](enlace) tal como vienen (se abren dentro de la app). Si no hay soporte, explica por qué (sin movimiento, pendiente, o movimiento sin archivo).",
    input_schema: { type: "object", properties: { pagoId: { type: "integer", description: "Número del pago si ya lo conoces." }, texto: { type: "string", description: "Qué pago (concepto, ítem…), si no tienes el número." } } },
  },
  {
    name: "resumen_tesoreria",
    description: "Resumen de Tesorería de un mes: pagos programados pendientes (P) y pagados (E) con sus valores, pagos vencidos, movimientos del banco sin asociar, propuestas del agente de asociación, alertas abiertas, saldo de cada banco y próximos pagos; además egresos e ingresos pagados y pendientes de cada mes del año. Todo calculado y con su moneda ISO 4217 (los textos ya vienen formateados, p. ej. «COP 1.234.567»: úsalos tal cual). Tipos: I ingreso, E egreso, J jornal, S saldo, T traslado; I, E y J (según su signo) suman en ingresos y egresos, S y T no.",
    input_schema: { type: "object", properties: { anio: { type: "integer", description: "Año (opcional, por defecto el actual)." }, mes: { type: "integer", description: "Mes 1-12 (opcional, por defecto el actual)." } } },
  },
  {
    name: "buscar_pagos_tesoreria",
    description: "Pagos programados de Tesorería (el «Detalle» del Excel), para citar pagos puntuales o contar. Filtra por texto (concepto), año, mes, estado (P pendiente / E pagado), tipo (I ingreso, E egreso, J jornal, S saldo, T traslado), ítem, vencidos y asociación (sin movimientos, con diferencia, pagados sin movimiento). Devuelve como máximo 'limite' filas, el total real y los totales del filtro ya calculados.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string" }, anio: { type: "integer" }, mes: { type: "integer" },
        estado: { type: "string", enum: ["P", "E"] }, tipo: { type: "string", enum: ["I", "E", "J", "S", "T"] },
        item: { type: "string", description: "Nombre o parte del nombre del ítem (inmueble, oficinas…)." },
        vencidos: { type: "boolean" }, asociacion: { type: "string", enum: ["sin", "con", "diferencia", "pagadoSinMovimiento"] },
        limite: { type: "integer", description: "Máximo de filas (por defecto 20, máximo 50)." },
      },
    },
  },
  {
    name: "buscar_movimientos_tesoreria",
    description: "Movimientos reales de los bancos (débitos y créditos). Filtra por texto (descripción, concepto, tercero), año, mes, banco, tipo y si están asociados a pagos. Devuelve como máximo 'limite' filas, el total real y los totales del filtro.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string" }, anio: { type: "integer" }, mes: { type: "integer" },
        banco: { type: "string", description: "Nombre o parte del nombre del banco." },
        tipo: { type: "string", enum: ["debito", "credito"] }, asociacion: { type: "string", enum: ["sin", "con", "parcial"] },
        limite: { type: "integer" },
      },
    },
  },
  {
    name: "saldos_bancos_tesoreria",
    description: "Saldo de cada banco mes a mes en un año, anclado a los extractos (cada extracto fija el saldo de ese día; después se suma y resta lo registrado), saldo a hoy y la diferencia de cada mes con lo que reportó el banco. Dice el último extracto de cada banco: si un mes ya cerrado no tiene extracto, su saldo NO está confirmado (dilo así). Si un banco no tiene saldo inicial ni extracto, su saldo no se puede calcular (nunca supongas 0).",
    input_schema: { type: "object", properties: { anio: { type: "integer" } } },
  },
];
export const NOMBRES_TESORERIA = new Set(TOOLS_TESORERIA.map((t) => t.name));

async function idPorNombre(modelo, texto) {
  if (!texto) return undefined;
  const t = sinTildes(texto);
  const filas = await modelo.findMany({ select: { id: true, nombre: true } });
  return (filas.find((f) => sinTildes(f.nombre) === t) || filas.find((f) => sinTildes(f.nombre).includes(t)))?.id ?? -1;
}

export async function ejecutarTesoreria(name, args, user) {
  if (!user || !(await accesoDe(user))) return { error: "Esta persona no tiene acceso a Tesorería." };
  const limite = Math.min(Math.max(1, Number(args.limite) || 20), 50);
  const rango = (porDefecto) => rangoTesoreria(args.periodo || porDefecto, { desde: args.desde, hasta: args.hasta, dias: args.dias });
  switch (name) {
    case "agenda_pagos_tesoreria": {
      const r = rango("este_mes");
      const a = await agendaPagos({ desde: r.desde, hasta: r.hasta, estado: args.estado || "todos", sentido: args.sentido || "todos", texto: args.texto, item: args.item, medio: args.medio, segun: args.segun, limite: Math.min(Math.max(1, Number(args.limite) || 40), 60) });
      const { _pagos, ...resto } = a;
      return { periodo: r.label, ...resto, totales: Object.fromEntries(Object.entries(a.totales).filter(([k]) => !k.startsWith("_"))) };
    }
    case "estado_pago_tesoreria": {
      const r = args.mes ? rangoTesoreria("mes", { mes: args.mes, anio: args.anio }) : args.periodo ? rango("este_mes") : { desde: null, hasta: null };
      return estadoDePago({ texto: args.texto, desde: r.desde, hasta: r.hasta });
    }
    case "reporte_banco_tesoreria": {
      const r = rango("anio_hasta_hoy");
      return { periodo: r.label, ...(await reporteBanco({ banco: args.banco, desde: r.desde, hasta: r.hasta })) };
    }
    case "saldos_hoy_tesoreria":
      return saldosConEstado();
    case "soporte_pago_tesoreria":
      return soportesDePago({ pagoId: args.pagoId, texto: args.texto });
    case "resumen_tesoreria": {
      const r = await resumenTesoreria({ anio: args.anio, mes: args.mes });
      return { ...r, porMes: r.porMes.filter((m) => m.pagos), nota: "Muestra el dinero con el código de moneda, p. ej. «COP 1.234.567». Los valores negativos son egresos." };
    }
    case "buscar_pagos_tesoreria": {
      const r = await listPagos({
        q: args.texto, anio: args.anio, mes: args.mes, estado: args.estado, tipo: args.tipo, vencidos: args.vencidos ? "1" : undefined, asociacion: args.asociacion,
        itemId: await idPorNombre(prisma.itemTesoreria, args.item), size: 100, page: 1,
      });
      return {
        total: r.total, totalesDelFiltro: r.totales,
        pagos: r.items.slice(0, limite).map((p) => ({ id: p.id, mes: `${p.anio}-${String(p.mes).padStart(2, "0")}`, vence: p.fecha, estado: p.estadoTexto, tipo: p.tipoTexto, item: p.item, concepto: p.concepto, medioPago: p.medioPago, paga: p.pagador, valor: p.valorTexto, movimientos: p.movimientos, diferencia: p.diferenciaTexto, periodicidad: p.periodicidad || "extraordinario" })),
      };
    }
    case "buscar_movimientos_tesoreria": {
      const r = await listMovimientos({
        q: args.texto, anio: args.anio, mes: args.mes, tipo: args.tipo, asociacion: args.asociacion,
        bancoId: await idPorNombre(prisma.bancoTesoreria, args.banco), size: 100, page: 1,
      });
      return {
        total: r.total, totalesDelFiltro: r.totales,
        movimientos: r.items.slice(0, limite).map((m) => ({ id: m.id, fecha: m.fecha, banco: m.banco, tipo: m.tipoTexto, descripcion: m.descripcion, concepto: m.concepto, tercero: m.tercero, valor: m.valorTexto, pagosAsociados: m.pagos, sinAsignar: m.sinAsignarTexto })),
      };
    }
    case "saldos_bancos_tesoreria": {
      const r = await reporteSaldos(args.anio);
      return {
        anio: r.anio, hoy: r.hoy,
        bancos: r.items.map((b) => ({
          banco: b.banco, moneda: b.moneda, saldoInicial: b.saldoInicial ?? "sin registrar", saldoHoy: b.saldoHoy ?? "no se puede calcular", saldoFinalDelAnio: b.saldoFinal ?? "no se puede calcular",
          ultimoExtracto: b.ultimoSaldoBanco?.dia || "ninguno",
          meses: b.meses.filter((m) => m.movimientos || m.reportado != null).map((m) => ({ mes: m.mes, creditos: m.creditos, debitos: m.debitos, saldoFinal: m.saldoFinal, deDondeSale: m.fuente === "banco" ? "extracto del banco" : m.fuente === "parcial" ? "extracto parcial" : "estimado (último saldo del banco ± movimientos)", segunElBanco: m.reportado, diferencia: m.diferencia })),
        })),
      };
    }
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}
