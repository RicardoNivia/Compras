import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "crypto";
import { generateStructuredJson } from "@/lib/aiStructured";
import { listRecords } from "@/lib/records";
import { listPresupuestos } from "@/lib/presupuestos";
import { businessDaysBetween, businessDaysElapsedToToday } from "@/lib/businessDays";
import { prisma } from "@/lib/prisma";
import { indicadoresCiclo } from "@/lib/proveedoresCiclo";
import { ymd, MESES } from "@/lib/reportSchedule";

// Mismo umbral que el KPI "Cumplimiento de tiempos" del Dashboard (ver
// DashboardView.jsx) — para que un informe que hable de tiempos de entrega
// use la misma definición de "a tiempo" en todo el panel.
const SLA_DIAS_HABILES = 8;

// Más bajo que el límite de "Explícame este número" (300): ahí el cliente ya
// manda el periodo filtrado; aquí siempre se parte del dataset completo, así
// que hay que recortar más para que el POST a la IA no quede tan pesado que
// se pase del timeout de conexión en una red corporativa lenta. Los totales
// exactos no dependen de este recorte (ver buildAggregates) — solo limita
// cuántos registros "de ejemplo" recibe el modelo para citar casos puntuales.
const MAX_RECORDS = 60;
const MAX_MUESTRA = 6;

const GRAFICO_SCHEMA = {
  type: "OBJECT",
  nullable: true,
  properties: {
    titulo: { type: "STRING" },
    tipo: { type: "STRING" }, // por ahora solo "barras" (dibujada en el PDF, ver lib/reportPdf.js)
    datos: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          etiqueta: { type: "STRING" },
          valor: { type: "NUMBER" },
        },
        required: ["etiqueta", "valor"],
      },
    },
  },
  required: ["titulo", "tipo", "datos"],
};

const TABLA_SCHEMA = {
  type: "OBJECT",
  nullable: true,
  properties: {
    columnas: { type: "ARRAY", items: { type: "STRING" } },
    filas: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
  },
  required: ["columnas", "filas"],
};

export const REPORT_SCHEMA = {
  type: "OBJECT",
  properties: {
    asunto: { type: "STRING" },
    saludo: { type: "STRING" },
    secciones: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          titulo: { type: "STRING" },
          contenido: { type: "STRING" },
          destacado: { type: "STRING", nullable: true },
          grafico: GRAFICO_SCHEMA,
          tabla: TABLA_SCHEMA,
        },
        required: ["titulo", "contenido"],
      },
    },
    cierre: { type: "STRING" },
  },
  required: ["asunto", "saludo", "secciones", "cierre"],
};

const SYSTEM_INSTRUCTION = `Eres el redactor del Informe Ejecutivo automático del Panel de Compras y Bienestar de Sinco. Un administrador describe, en lenguaje natural, qué debe contener el informe periódico que se envía por correo. Tienes el set de registros de compra (JSON) para basarte en datos reales.

Devuelve un informe ejecutivo breve y claro en español, con:
- "asunto": línea de asunto de correo, concreta (sin fecha, eso se agrega aparte).
- "saludo": un saludo corto y profesional (1 frase), sin nombre de destinatario específico (ej. "Buen día,").
- "secciones": 2 a 5 bloques, cada uno con "titulo" corto y "contenido" (texto en 2-6 líneas; usa líneas que empiecen con "- " para viñetas cuando ayude a la lectura). "destacado" es opcional: un dato numérico clave de esa sección (ej. "$128.400.000" o "37 compras"), o null si no aplica.
- "grafico": OPCIONAL por sección — inclúyelo SOLO cuando el prompt pida comparar, distribuir o desglosar un ÚNICO valor entre varias categorías (por área, por categoría, por estado, por estado de legalización, por proveedor, etc.) y existan datos de "agregados" para esa agrupación. "tipo" siempre "barras". "datos": 3 a 8 pares {etiqueta, valor}, el "valor" debe salir de "agregados" (cantidad, valorConIva o porcentaje según lo que pida el prompt), ordenados de mayor a menor. Si la sección es puramente narrativa o no hay una agrupación clara que graficar, deja "grafico" en null — no inventes una categorización que no esté en los agregados.
- "tabla": OPCIONAL por sección — inclúyela cuando el prompt pida explícitamente un "resumen en tabla" o comparar VARIAS columnas a la vez (ej. presupuesto vs. gastado vs. % por área). "columnas": 2 a 5 encabezados cortos. "filas": hasta 15 filas, cada una un array de strings en el mismo orden que "columnas", con los números ya formateados como texto legible (ej. "$50.700.000", "72%") — nunca inventes una fila para un área/categoría que no esté en "agregados". Si no aplica, deja "tabla" en null. Una sección puede tener "grafico" y "tabla" a la vez si el prompt lo amerita, o ninguno de los dos.
- "cierre": una frase final breve (ej. invitar a revisar el panel para más detalle).

Si el prompt menciona tiempos de entrega, tiempos de respuesta, cumplimiento, demoras, atrasos o algo similar, básate en "agregados.tiemposEntrega": "promedioDiasHabiles" (promedio real en días hábiles desde la solicitud hasta la entrega), "cumplimientoPct" (% de compras entregadas dentro de ${SLA_DIAS_HABILES} días hábiles, el mismo umbral que usa el Dashboard), "totalPendientesVencidos" (solicitudes aún sin entregar que ya superaron ese plazo) y "peoresEntregasMuestra"/"pendientesVencidosMuestra" para citar casos puntuales (cada una incluye "observaciones", el campo que el sistema usa como justificante/anotación de esa compra — cítalo tal cual si el prompt pide "justificantes", y si viene vacío dilo explícitamente en vez de inventar uno). No calcules tiempos de entrega a partir de la muestra de "registros" ni inventes un criterio de cumplimiento distinto al indicado aquí.

Si el prompt menciona presupuesto, gasto, % gastado o "presupuesto vs. gastado", básate en "agregados.presupuesto" (por año y área: "presupuestado", "gastado", "porcentajeGastado", y "categorias" con el desglose de gasto por categoría dentro de esa área cuando exista). Un área sin presupuesto configurado para el año no aparece ahí — dilo explícitamente si el prompt la menciona, no inventes un presupuesto para ella.

Reglas estrictas: para CUALQUIER cifra total, suma, conteo o porcentaje (valor total comprado, número de compras, compras sin legalizar, tiempos de entrega, % gastado del presupuesto, etc.) usa SIEMPRE los valores de "agregados" — están calculados sobre el 100% de los datos y son exactos. La lista "registros" es solo una MUESTRA (puede no incluir todos) para citar ejemplos puntuales (proveedor, área, descripción) — nunca la uses para calcular totales, y nunca digas que un dato "no se puede calcular con certeza" si ya está en "agregados". Nunca inventes cifras, proveedores, fechas, justificantes ni datos de gráficos/tablas que no estén en la información entregada. Sé conciso — esto se lee en un correo, no es un documento extenso.`;

function compactRecord(r) {
  return {
    informe: r.informe,
    fechaSolicitud: r.fechaSolicitud,
    fechaEntrega: r.fechaEntrega,
    area: r.area,
    responsable: r.responsable,
    estado: r.estado,
    categoria: r.categoria,
    proveedor: r.proveedor,
    medioPago: r.medioPago,
    estadoLegalizacion: r.estadoLegalizacion,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    radicado: r.radicado,
  };
}

// Versión más liviana que compactRecord, solo para las "muestras" de
// agregados (tiemposEntrega, sinLegalizar) — ahí no hace falta el detalle
// completo del registro, y recortar campos reduce bastante el tamaño del
// POST a la IA (ver MAX_RECORDS/MAX_MUESTRA más arriba).
function miniRecord(r, extra) {
  return { informe: r.informe, area: r.area, proveedor: r.proveedor, valorConIva: r.valorConIva, observaciones: r.observaciones || null, ...extra };
}

function countBy(records, field) {
  const out = {};
  for (const r of records) {
    const key = r[field] || "Sin dato";
    if (!out[key]) out[key] = { cantidad: 0, valorConIva: 0 };
    out[key].cantidad += 1;
    out[key].valorConIva += r.valorConIva || 0;
  }
  return out;
}

// Tiempos de solicitud a entrega, en días hábiles — misma definición que el
// KPI "Cumplimiento de tiempos" del Dashboard (DashboardView.jsx): entregadas
// se miden solicitud→entrega, pendientes se miden solicitud→hoy (y cuentan
// como "vencidas" si ya superan el SLA sin haberse entregado).
function buildTiemposEntrega(records) {
  const entregados = [];
  const pendientes = [];
  for (const r of records) {
    if (!r.fechaSolicitud) continue;
    if (r.fechaEntrega) {
      const dias = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
      if (dias !== null) entregados.push({ r, diasHabiles: dias, cumplio: dias <= SLA_DIAS_HABILES });
    } else {
      const dias = businessDaysElapsedToToday(r.fechaSolicitud);
      if (dias !== null) pendientes.push({ r, diasHabiles: dias, vencido: dias > SLA_DIAS_HABILES });
    }
  }
  const cumplieron = entregados.filter((e) => e.cumplio).length;
  const pendientesVencidos = pendientes.filter((p) => p.vencido);
  const peoresEntregas = [...entregados].sort((a, b) => b.diasHabiles - a.diasHabiles).slice(0, MAX_MUESTRA);

  return {
    slaDiasHabiles: SLA_DIAS_HABILES,
    totalEntregados: entregados.length,
    cumplieronSla: cumplieron,
    cumplimientoPct: entregados.length ? Math.round((cumplieron / entregados.length) * 1000) / 10 : null,
    promedioDiasHabiles: entregados.length
      ? Math.round((entregados.reduce((s, e) => s + e.diasHabiles, 0) / entregados.length) * 10) / 10
      : null,
    totalPendientes: pendientes.length,
    totalPendientesVencidos: pendientesVencidos.length,
    peoresEntregasMuestra: peoresEntregas.map((e) => miniRecord(e.r, { diasHabiles: e.diasHabiles })),
    pendientesVencidosMuestra: pendientesVencidos.slice(0, MAX_MUESTRA).map((p) => miniRecord(p.r, { diasHabiles: p.diasHabiles })),
  };
}

// Presupuesto vs. gastado por área (y por categoría dentro del área, si el
// año maneja presupuesto en modo "categoria") — "gastado" sale de los
// registros de compra del mismo año que el presupuesto, cruzando por el
// campo "area" tal cual aparece en ambos. Un área sin presupuesto configurado
// para ese año simplemente no aparece en el resultado.
function buildPresupuestoComparativo(records, presupuestos) {
  const porArea = {};
  for (const p of presupuestos) {
    porArea[p.area] = {
      anio: p.anio,
      presupuestado: p.total,
      gastado: 0,
      porcentajeGastado: null,
      categorias: p.categorias?.length ? Object.fromEntries(p.categorias.map((c) => [c.categoria, { presupuestado: c.valor, gastado: 0 }])) : undefined,
    };
  }
  for (const r of records) {
    const anioRecord = Number((r.fechaSolicitud || "").slice(0, 4));
    const entry = porArea[r.area];
    if (!entry || entry.anio !== anioRecord) continue;
    entry.gastado += r.valorConIva || 0;
    const catEntry = entry.categorias?.[r.categoria];
    if (catEntry) catEntry.gastado += r.valorConIva || 0;
  }
  for (const area of Object.keys(porArea)) {
    const a = porArea[area];
    a.porcentajeGastado = a.presupuestado > 0 ? Math.round((a.gastado / a.presupuestado) * 1000) / 10 : null;
  }
  return porArea;
}

// Top N de un countBy() por valorConIva descendente — para desgloses con
// muchos valores posibles (proveedores: puede haber cientos) donde devolver
// TODOS inflaría el resultado sin necesidad; el top N ya cubre lo que
// cualquier "análisis general" necesita citar. Útil especialmente como
// resultado de herramienta del Agente IA del chat (ver lib/agentTools.js):
// así el modelo nunca necesita iterar registro por registro para sacar un
// ranking de proveedores, lo recibe ya calculado en un solo llamado.
function topByValor(countByObj, n) {
  return Object.entries(countByObj)
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.valorConIva - a.valorConIva)
    .slice(0, n);
}

// Totales exactos sobre el 100% de los registros — lo que el prompt le pide a
// modelo que use para cualquier cifra, en vez de la muestra recortada (que
// puede no representar el dataset completo y llevaría a cifras incorrectas
// o a que el modelo diga "no se puede calcular" sin necesidad).
export function buildAggregates(records, presupuestos) {
  const sinLegalizar = records.filter((r) => (r.estadoLegalizacion || "").toLowerCase() !== "legalizado");
  const porProveedor = countBy(records, "proveedor");
  return {
    totalRegistros: records.length,
    totalValorConIva: records.reduce((s, r) => s + (r.valorConIva || 0), 0),
    totalValorSinIva: records.reduce((s, r) => s + (r.valorSinIva || 0), 0),
    // Muchas compras no traen el valor sin IVA: la suma de arriba es SOLO de las que lo tienen. Se dice cuántas son
    // para que Nova (y los informes) no la comparen con el total con IVA como si cubriera lo mismo.
    comprasConValorSinIva: records.filter((r) => r.valorSinIva != null && r.valorSinIva > 0).length,
    valorConIvaDeEsasCompras: records.filter((r) => r.valorSinIva != null && r.valorSinIva > 0).reduce((s, r) => s + (r.valorConIva || 0), 0),
    totalSinLegalizar: sinLegalizar.length,
    sinLegalizarMuestra: sinLegalizar.slice(0, MAX_MUESTRA).map((r) => miniRecord(r, { estadoLegalizacion: r.estadoLegalizacion })),
    porArea: countBy(records, "area"),
    porEstado: countBy(records, "estado"),
    porCategoria: countBy(records, "categoria"),
    porEstadoLegalizacion: countBy(records, "estadoLegalizacion"),
    porMedioPago: countBy(records, "medioPago"),
    totalProveedoresDistintos: Object.keys(porProveedor).length,
    porProveedorTop15: topByValor(porProveedor, 15),
    tiemposEntrega: buildTiemposEntrega(records),
    presupuesto: buildPresupuestoComparativo(records, presupuestos),
  };
}

// Trae records+presupuestos sin agregar nada todavía — lo usan tanto
// loadAggregates (flujo legado/bloque IA, siempre sobre el histórico
// completo) como renderReportFromBloques (que filtra por bloque según su
// "periodo" antes de agregar, ver filterRecordsByPeriodo).
// ---------- Alcance del informe (filtro por área y categoría) ----------
// Un informe puede limitarse a unas áreas y/o categorías (contexto.filtros = { areas: [], categorias: [] }), p. ej.
// "consumo en Imprevistos Administrativos". En vez de pasar el filtro por cada función, la generación corre dentro de
// conAlcance(): todo lo que carga compras para el informe (cifras, gráficas, tablas, secciones de Nova, el "¿de dónde
// sale?" y el resumen de la edición) pasa por loadRecordsAndPresupuestos y ve solo las compras del alcance.
const alcanceActual = new AsyncLocalStorage();
const normAlcance = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function normalizarAlcance(f) {
  const lista = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 30);
  const areas = lista(f?.areas);
  const categorias = lista(f?.categorias);
  return areas.length || categorias.length ? { areas, categorias } : null;
}
export function conAlcance(filtros, fn) {
  const a = normalizarAlcance(filtros);
  return a ? alcanceActual.run(a, fn) : fn();
}
// "Categoría: Imprevistos Administrativos (TIT) · Áreas: Administrativo" (o null si es todo).
export function textoAlcance(filtros = alcanceActual.getStore()) {
  const a = normalizarAlcance(filtros);
  if (!a) return null;
  return [a.categorias.length ? `${a.categorias.length > 1 ? "Categorías" : "Categoría"}: ${a.categorias.join(", ")}` : null, a.areas.length ? `${a.areas.length > 1 ? "Áreas" : "Área"}: ${a.areas.join(", ")}` : null].filter(Boolean).join(" · ");
}

async function loadRecordsAndPresupuestos() {
  const anioActual = new Date().getFullYear();
  const [records, { presupuestos }] = await Promise.all([
    listRecords(),
    listPresupuestos({ anio: anioActual }),
  ]);
  const a = alcanceActual.getStore();
  if (!a) return { records, presupuestos };
  const areas = new Set(a.areas.map(normAlcance));
  const cats = new Set(a.categorias.map(normAlcance));
  return {
    records: records.filter((r) => (!areas.size || areas.has(normAlcance(r.area))) && (!cats.size || cats.has(normAlcance(r.categoria)))),
    // El presupuesto es por área: con filtro de área solo esas áreas; con filtro de categoría el gastado ya es solo de esa categoría.
    presupuestos: areas.size ? presupuestos.filter((p) => areas.has(normAlcance(p.area))) : presupuestos,
  };
}

// Trae records+presupuestos y arma agregados/muestra — compartido entre el
// flujo legado (un solo prompt para todo el informe) y el bloque "ia" (ver
// generateBloqueIaContent), ambos siempre sobre el histórico completo (el
// prompt/la pregunta puede pedir un periodo específico en su propio texto).
async function loadAggregates() {
  const { records, presupuestos } = await loadRecordsAndPresupuestos();
  const aggregates = buildAggregates(records, presupuestos);
  // Muestra para ejemplos puntuales: prioriza los más recientes (más
  // relevantes para un informe ejecutivo que una muestra arbitraria).
  const sample = [...records].reverse().slice(0, MAX_RECORDS).map(compactRecord);
  return { records, aggregates, sample };
}

// Periodo dinámico de un bloque kpi/grafico/tabla (ver ReportBloqueBuilder.jsx):
// se recalcula en cada generación (vista previa, envío manual o programado)
// relativo al momento en que corre — "mes anterior" siempre es el mes antes
// de HOY, nunca una fecha fija guardada en el bloque. "historico" (default,
// también el comportamiento de un bloque guardado antes de que existiera este
// selector) no filtra nada.
const PERIODO_LABELS = {
  mes_actual: "mes actual",
  mes_anterior: "mes anterior",
  anio_actual: "año actual",
  anio_anterior: "año anterior",
  semana_anterior: "semana anterior",
};

// Rango [desde, hasta] (YYYY-MM-DD, inclusivo) de un período relativo a "now". offset = 1 da el período inmediatamente
// anterior, para comparar (en "anio_actual" es el mismo tramo enero→hoy del año pasado). "historico" → null.
export function rangoPeriodo(periodo, offset = 0, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (periodo) {
    case "mes_actual": {
      if (!offset) return { desde: ymd(new Date(y, m, 1)), hasta: ymd(now) };
      return { desde: ymd(new Date(y, m - offset, 1)), hasta: ymd(new Date(y, m - offset + 1, 0)) };
    }
    case "mes_anterior":
      return { desde: ymd(new Date(y, m - 1 - offset, 1)), hasta: ymd(new Date(y, m - offset, 0)) };
    case "anio_actual":
      return { desde: ymd(new Date(y - offset, 0, 1)), hasta: ymd(new Date(y - offset, m, now.getDate())) };
    case "anio_anterior":
      return { desde: ymd(new Date(y - 1 - offset, 0, 1)), hasta: ymd(new Date(y - 1 - offset, 11, 31)) };
    case "semana_anterior": {
      const lunes = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7) - 7 * (1 + offset));
      return { desde: ymd(lunes), hasta: ymd(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6)) };
    }
    default:
      return null;
  }
}

// Cómo se nombra el período anterior en las comparaciones ("vs agosto", "vs mismo período de 2025").
export function etiquetaPeriodoAnterior(periodo, now = new Date()) {
  const r = rangoPeriodo(periodo, 1, now);
  if (!r) return null;
  const [y, mm] = r.desde.split("-").map(Number);
  if (periodo === "mes_actual" || periodo === "mes_anterior") return MESES[mm - 1];
  if (periodo === "anio_actual") return `mismo período de ${y}`;
  if (periodo === "anio_anterior") return String(y);
  return "la semana previa";
}

function periodoSufijo(periodo) {
  const label = PERIODO_LABELS[periodo];
  return label ? ` (${label})` : "";
}

// "ahora": fecha de referencia del período (por defecto hoy). Permite generar un envío como si fuera otra fecha,
// p. ej. reponer el informe de un mes que no se generó (ver lib/reportEdiciones.js#generarEdicion).
function filterRecordsByPeriodo(records, periodo, offset = 0, ahora = new Date()) {
  if (!periodo || periodo === "historico" || !PERIODO_LABELS[periodo]) return offset ? [] : records;
  const rango = rangoPeriodo(periodo, offset, ahora);
  if (rango) {
    return records.filter((r) => r.fechaSolicitud && r.fechaSolicitud.slice(0, 10) >= rango.desde && r.fechaSolicitud.slice(0, 10) <= rango.hasta);
  }
  const now = new Date();
  const anioActual = now.getFullYear();
  const mesActual = now.getMonth(); // 0 = enero
  let anio;
  let mes = null;
  if (periodo === "mes_actual") {
    anio = anioActual; mes = mesActual;
  } else if (periodo === "mes_anterior") {
    const d = new Date(anioActual, mesActual - 1, 1);
    anio = d.getFullYear(); mes = d.getMonth();
  } else if (periodo === "anio_actual") {
    anio = anioActual;
  } else if (periodo === "anio_anterior") {
    anio = anioActual - 1;
  }
  return records.filter((r) => {
    if (!r.fechaSolicitud) return false;
    const [y, m] = r.fechaSolicitud.split("-").map(Number);
    if (!y) return false;
    if (mes !== null) return y === anio && m - 1 === mes;
    return y === anio;
  });
}

// Genera el contenido estructurado del informe a partir de UN SOLO prompt del
// admin — sin streaming, usando Anthropic (ver lib/aiStructured.js). Flujo
// legado: la IA decide
// toda la estructura del informe. Se mantiene para informes guardados antes
// del constructor por bloques, y como motor de "generar borrador con IA"
// dentro de ese constructor (ver ReportBloqueBuilder.jsx).
async function generateReportContentFromPrompt(prompt) {
  const { records, aggregates, sample } = await loadAggregates();

  const userPrompt = `Instrucción del administrador sobre qué debe contener el informe:
"""${prompt}"""

Agregados exactos (calculados sobre los ${records.length} registros del dataset completo):
${JSON.stringify(aggregates)}

Muestra de registros más recientes (JSON, ${sample.length} de ${records.length}, solo para ejemplos puntuales — no para totales):
${JSON.stringify(sample)}`;

  return generateStructuredJson({ systemInstruction: SYSTEM_INSTRUCTION, prompt: userPrompt, schema: REPORT_SCHEMA });
}

// Mismo criterio de "atípico" que usa el Dashboard (DashboardView.jsx#ahorro):
// una cotización más de 20x el valor de compra se excluye del cálculo de
// ahorro (suele ser un error de digitación, no un ahorro real).
function cotizacionesValidas(records) {
  return records.filter((r) => r.valorCot != null && r.valorConIva != null && !(r.valorCot > r.valorConIva * 20));
}

function computeTicketPromedio(records) {
  if (!records.length) return null;
  const total = records.reduce((s, r) => s + (r.valorConIva || 0), 0);
  return total / records.length;
}

function computeAhorroTotal(records) {
  const validCot = cotizacionesValidas(records);
  const valorCotizado = validCot.reduce((s, r) => s + (r.valorCot || 0), 0);
  const valorCompraCotizados = validCot.reduce((s, r) => s + (r.valorConIva || 0), 0);
  return valorCotizado - valorCompraCotizados;
}

function computePctAhorro(records) {
  const validCot = cotizacionesValidas(records);
  const valorCotizado = validCot.reduce((s, r) => s + (r.valorCot || 0), 0);
  if (!valorCotizado) return null;
  return Math.round((computeAhorroTotal(records) / valorCotizado) * 1000) / 10;
}

const KPI_METRICAS = {
  totalValorConIva: { label: "Valor total comprado", formato: "moneda" },
  totalRegistros: { label: "Total de compras", formato: "entero" },
  totalSinLegalizar: { label: "Compras sin legalizar", formato: "entero" },
  cumplimientoPct: { label: "Cumplimiento de tiempos de entrega", formato: "porcentaje", path: "tiemposEntrega.cumplimientoPct" },
  promedioDiasHabiles: { label: "Promedio días hábiles de entrega", formato: "dias", path: "tiemposEntrega.promedioDiasHabiles" },
  totalPendientesVencidos: { label: "Pendientes vencidos (fuera de SLA)", formato: "entero", path: "tiemposEntrega.totalPendientesVencidos" },
  ticketPromedio: { label: "Ticket promedio por compra", formato: "moneda", compute: computeTicketPromedio },
  ahorroTotal: { label: "Ahorro total (cotizado vs. comprado)", formato: "moneda", compute: computeAhorroTotal },
  pctAhorro: { label: "% de ahorro global", formato: "porcentaje", compute: computePctAhorro },
  // Mismas cifras que las tarjetas del Dashboard
  enProceso: { label: "Compras en proceso", formato: "entero", compute: (rs) => rs.filter((r) => r.estado === "Proceso").length },
  valorCotizado: { label: "Valor cotizado", formato: "moneda", compute: (rs) => cotizacionesValidas(rs).reduce((s, r) => s + (r.valorCot || 0), 0) },
  valorCompraCotizados: { label: "Valor compra (cotizados)", formato: "moneda", compute: (rs) => cotizacionesValidas(rs).reduce((s, r) => s + (r.valorConIva || 0), 0) },
  // Presupuesto vs. gastado — nivel general (año del período, acumulado hasta el fin del período)
  presupuestado: { label: "Presupuestado", formato: "moneda", general: "presupuestado" },
  gastadoAnio: { label: "Gastado en el año", formato: "moneda", general: "gastado" },
  pctConsumido: { label: "% consumido del presupuesto", formato: "porcentaje", general: "pct" },
  disponible: { label: "Presupuesto disponible", formato: "moneda", general: "disponible" },
};

// Presupuesto vs. gastado del año del período (igual que "Presupuesto vs. gastado — nivel general" del Dashboard).
function presupuestoGeneral(ctx, periodo) {
  if (!ctx?.presupuestos) return null;
  const ahora = ctx.ahora || new Date();
  const hasta = rangoPeriodo(periodo, 0, ahora)?.hasta || ymd(ahora);
  const anio = hasta.slice(0, 4);
  const presupuestado = ctx.presupuestos.filter((p) => String(p.anio) === anio).reduce((s, p) => s + (p.total || 0), 0);
  const gastado = (ctx.allRecords || [])
    .filter((r) => r.fechaSolicitud && r.fechaSolicitud.slice(0, 4) === anio && r.fechaSolicitud.slice(0, 10) <= hasta)
    .reduce((s, r) => s + (r.valorConIva || 0), 0);
  return { presupuestado, gastado, pct: presupuestado ? Math.round((gastado / presupuestado) * 1000) / 10 : null, disponible: presupuestado - gastado, anio };
}

function resolveKpiValue(metrica, records, aggregates) {
  const def = KPI_METRICAS[metrica] || KPI_METRICAS.totalValorConIva;
  if (def.compute) return def.compute(records);
  if (def.path) return resolvePath(aggregates, def.path);
  return aggregates[metrica];
}

const AGRUPAR_LABELS = {
  area: "área", categoria: "categoría", estado: "estado",
  estadoLegalizacion: "estado de legalización", proveedor: "proveedor",
  responsable: "responsable", medioPago: "medio de pago", mes: "mes", dia: "día",
  compra: "compra", // cada barra/fila es UNA compra (tops de compras)
};

// "mes" y "dia" son agrupaciones cronológicas (eje X = tiempo); el resto agrupa por un campo del registro y se ordena
// por valor (top N).
const AGRUPACIONES_CRONOLOGICAS = ["mes", "dia"];

// Métricas de valoración de Nova (puntaje 1-5) para "grafico": en vez de sumar valor o contar compras, promedian el
// puntaje guardado de las compras valoradas del período, agrupado por proveedor, área, categoría, etc. Sirven para
// rankings como "top 5 proveedores con menor valoración" (orden "menor": peores primero) o "con mayor valoración".
const METRICAS_VALORACION = { valoracionProveedor: "puntajeProveedor", valoracionCompra: "puntajeCompra" };
const VALORACION_LABELS = { valoracionProveedor: "valoración del proveedor", valoracionCompra: "valoración de la compra" };
const fmtPuntaje = (n) => Number(n).toFixed(1).replace(".", ",");

async function calcularGruposValoracion(records, { agruparPor, metricaAgrupada, orden, limite }) {
  const campoPuntaje = METRICAS_VALORACION[metricaAgrupada];
  const ids = records.map((r) => r.id);
  const vals = ids.length
    ? await prisma.valoracionCompra.findMany({ where: { recordId: { in: ids }, ...(campoPuntaje === "puntajeProveedor" ? { puntajeProveedor: { not: null } } : {}) } /* puntajeCompra es obligatorio: no admite "not: null" */, select: { recordId: true, [campoPuntaje]: true } })
    : [];
  const porId = new Map(records.map((r) => [r.id, r]));
  const grupos = new Map();
  for (const v of vals) {
    const r = porId.get(v.recordId);
    if (!r) continue;
    const nombre = agruparPor === "compra" ? etiquetaCompra(r) : r[agruparPor];
    if (!nombre) continue; // un cajón "sin proveedor/área" no tiene sentido en un ranking
    if (!grupos.has(nombre)) grupos.set(nombre, { nombre, xs: [], valor: 0 });
    const g = grupos.get(nombre);
    g.xs.push(v[campoPuntaje]);
    g.valor += r.valorConIva || 0;
  }
  const mayor = orden === "mayor";
  const lista = [...grupos.values()]
    .map((g) => ({ nombre: g.nombre, promedio: g.xs.reduce((a, x) => a + x, 0) / g.xs.length, compras: g.xs.length, valor: g.valor }))
    .sort((a, b) => (mayor ? b.promedio - a.promedio : a.promedio - b.promedio) || b.compras - a.compras || b.valor - a.valor);
  return { total: lista.length, grupos: lista.slice(0, limite) };
}

async function renderGraficoValoracion(b, records, sufijo, periodo, campoPedido) {
  const campo = AGRUPACIONES_CRONOLOGICAS.includes(campoPedido) ? "proveedor" : campoPedido;
  const metrica = b.metricaAgrupada;
  const orden = b.orden === "mayor" ? "mayor" : "menor";
  const limite = Math.min(Math.max(Number(b.limite) || 5, 1), 15);
  const etiquetaCampo = AGRUPAR_LABELS[campo] || campo;
  const titulo = b.titulo || `${orden === "menor" ? "Menor" : "Mayor"} valoración por ${etiquetaCampo}${sufijo}`;
  const { total, grupos } = await calcularGruposValoracion(records, { agruparPor: campo, metricaAgrupada: metrica, orden, limite });
  if (!grupos.length) return { titulo, contenido: "No hay compras valoradas por Nova en este período.", destacado: null, grafico: null, tabla: null };
  const datos = grupos.map((g) => ({ etiqueta: g.nombre, valor: Math.round(g.promedio * 10) / 10 }));
  const nCompras = (g) => (campo === "compra" ? "" : ` (${g.compras} compra${g.compras === 1 ? "" : "s"})`);
  const detalle = grupos.map((g) => `${g.nombre} ${fmtPuntaje(g.promedio)}${nCompras(g)}`).join("; ");
  const base = `Promedio de la ${VALORACION_LABELS[metrica]} de Nova por ${etiquetaCampo}${sufijo}, de ${orden === "menor" ? "menor a mayor" : "mayor a menor"} (${grupos.length} de ${total}): ${detalle}.`;
  const contenido = await conAnalisisIa(b, base, { tipoOrigen: "grafico", agruparPor: campo, metricaAgrupada: metrica, orden, limite, periodo });
  return {
    titulo,
    contenido,
    destacado: `${grupos[0].nombre}: ${fmtPuntaje(grupos[0].promedio)} de 5${nCompras(grupos[0])}`,
    // Sin "_agruparPor": la ventana "de dónde sale esta cifra" explica valores y cantidades, no promedios de valoración.
    grafico: { titulo, tipo: "barras", datos, metrica, promedio: false },
    tabla: null,
  };
}

function agruparRegistros(records, campo, limit) {
  if (campo === "mes") return groupRecordsByMonth(records);
  if (campo === "dia") return groupRecordsByDay(records);
  return groupRecordsBy(records, campo, limit);
}

// Columnas apiladas: eje X = tiempo (mes o día), cada columna partida por una "serie" (área, categoría, proveedor…).
// Las 5 series de mayor valor van con su nombre; el resto se agrupa en "Otras".
function groupTiempoPorSerie(records, campo, serie, metrica) {
  const claveTiempo = (r) => (campo === "dia" ? r.fechaSolicitud.slice(0, 10) : r.fechaSolicitud.slice(0, 7));
  const totales = new Map();
  for (const r of records) {
    if (!r.fechaSolicitud) continue;
    const s = r[serie] || "Sin dato";
    totales.set(s, (totales.get(s) || 0) + (metrica === "cantidad" ? 1 : r.valorConIva || 0));
  }
  const top = [...totales.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);
  const series = totales.size > top.length ? [...top, "Otras"] : top;
  const map = new Map();
  for (const r of records) {
    if (!r.fechaSolicitud) continue;
    const k = claveTiempo(r);
    if (!map.has(k)) map.set(k, new Map());
    const s = top.includes(r[serie] || "Sin dato") ? r[serie] || "Sin dato" : "Otras";
    const m = map.get(k);
    m.set(s, (m.get(s) || 0) + (metrica === "cantidad" ? 1 : r.valorConIva || 0));
  }
  const datos = [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(campo === "dia" ? -62 : -12)
    .map(([k, m]) => {
      const p = k.split("-");
      const etiqueta = campo === "dia" ? `${Number(p[2])} ${MESES_CORTOS[Number(p[1]) - 1]}` : `${MESES_CORTOS[Number(p[1]) - 1]} ${p[0]}`;
      const segmentos = series.map((s) => ({ nombre: s, valor: m.get(s) || 0 }));
      return { etiqueta, valor: segmentos.reduce((a, x) => a + x.valor, 0), segmentos };
    });
  return { series, datos };
}

// Agrupación por día de solicitud, en orden cronológico (máximo los últimos 62 días con datos).
function groupRecordsByDay(records) {
  const map = new Map();
  for (const r of records) {
    if (!r.fechaSolicitud) continue;
    const key = r.fechaSolicitud.slice(0, 10);
    if (!map.has(key)) map.set(key, { cantidad: 0, valorConIva: 0 });
    const e = map.get(key);
    e.cantidad += 1;
    e.valorConIva += r.valorConIva || 0;
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-62)
    .map(([key, v]) => {
      const [, m, d] = key.split("-");
      return { nombre: `${Number(d)} ${MESES_CORTOS[Number(m) - 1]}`, cantidad: v.cantidad, valorConIva: v.valorConIva };
    });
}

function resolvePath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? null : o[k]), obj);
}

function fmtMoneda(n) {
  return `$${Math.round(n || 0).toLocaleString("es-CO")}`;
}

function fmtKpiValue(valor, formato) {
  if (valor === null || valor === undefined) return "Sin datos";
  if (formato === "moneda") return fmtMoneda(valor);
  if (formato === "porcentaje") return `${Number(valor).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
  if (formato === "dias") return `${Number(valor).toLocaleString("es-CO", { maximumFractionDigits: 1 })} días hábiles`;
  return String(valor);
}

// Agrupación genérica por cualquier campo del registro (incluye "proveedor",
// que no viene precalculado en "agregados") — usada por los bloques de tipo
// grafico/tabla. A diferencia del resto de "agregados" (exactos sobre el
// 100%), aquí se limita a las "limit" agrupaciones de mayor valor, igual que
// hace la IA en el flujo legado, para no saturar el PDF.
// Etiqueta corta de una compra individual para ejes y tablas: "#523 Mantenimiento de equipos…".
function etiquetaCompra(r) {
  const desc = String(r.descripcion || r.informe || "").replace(/\s+/g, " ").trim();
  return `${r.localSeq ? `#${r.localSeq}` : String(r.id).slice(0, 6)} ${desc.length > 34 ? `${desc.slice(0, 34)}…` : desc}`.trim();
}

function groupRecordsBy(records, field, limit) {
  if (field === "compra") {
    return records
      .map((r) => ({ nombre: etiquetaCompra(r), cantidad: 1, valorConIva: r.valorConIva || 0 }))
      .sort((a, b) => b.valorConIva - a.valorConIva)
      .slice(0, limit);
  }
  const map = countBy(records, field);
  return Object.entries(map)
    .map(([nombre, v]) => ({ nombre, cantidad: v.cantidad, valorConIva: v.valorConIva }))
    .sort((a, b) => b.valorConIva - a.valorConIva)
    .slice(0, limit);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Agrupación cronológica por mes (no por valor, a diferencia de
// groupRecordsBy) — para el bloque "Valor de compras por mes" del catálogo
// Dashboard (ver DASHBOARD_SECCIONES en ReportBloqueBuilder.jsx). Limitado a
// los últimos 12 meses con datos, para no saturar el PDF.
function groupRecordsByMonth(records) {
  const map = new Map();
  for (const r of records) {
    if (!r.fechaSolicitud) continue;
    const key = r.fechaSolicitud.slice(0, 7); // YYYY-MM
    if (!map.has(key)) map.set(key, { cantidad: 0, valorConIva: 0 });
    const e = map.get(key);
    e.cantidad += 1;
    e.valorConIva += r.valorConIva || 0;
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([key, v]) => {
      const [y, m] = key.split("-");
      return { nombre: `${MESES_CORTOS[Number(m) - 1]} ${y}`, cantidad: v.cantidad, valorConIva: v.valorConIva };
    });
}

// Permite escribir, dentro de un bloque de texto, placeholders como
// "{{totalValorConIva}}" o "{{cumplimientoPct}}" (mismas claves que el
// selector de bloque KPI, ver KPI_METRICAS) — se reemplazan por el valor
// real, ya formateado, calculado sobre el periodo general del informe. Un
// placeholder con una clave desconocida se deja tal cual, sin romper el texto.
function interpolarTexto(texto, aggregates) {
  if (!texto) return texto;
  return texto.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const def = KPI_METRICAS[key];
    if (!def) return match;
    const valor = def.path ? resolvePath(aggregates, def.path) : aggregates[key];
    return fmtKpiValue(valor, def.formato);
  });
}

function renderBloqueTexto(b, aggregates) {
  return {
    titulo: interpolarTexto(b.titulo, aggregates) || "Nota",
    contenido: interpolarTexto(b.contenido, aggregates) || "",
    destacado: b.destacado ? interpolarTexto(b.destacado, aggregates) : null,
    grafico: null,
    tabla: null,
  };
}

// Si el bloque tiene marcada la casilla "Agregar análisis de IA" (ver
// AnalisisIaToggle en ReportBloqueBuilder.jsx), ejecuta la IA con el
// "contexto" EXACTO de ese bloque (su propia métrica/agrupación y el periodo
// general del informe) y añade el resultado al final del contenido del
// mismo bloque — nunca crea una sección aparte, ni usa otros datos.
async function conAnalisisIa(b, contenidoBase, contexto) {
  if (!b.analisisIa) return contenidoBase;
  try {
    const analisis = await iaConCache(b.analisisPregunta, contexto);
    return `${contenidoBase}\n\n${analisis.contenido}`;
  } catch (err) {
    return `${contenidoBase}\n\n(No se pudo generar el análisis de IA: ${err.message})`;
  }
}

// Variación frente al período anterior: en puntos para porcentajes, en % para el resto.
function variacionKpi(valor, previo, formato, etiqueta) {
  if (valor == null || previo == null || !etiqueta) return null;
  const signo = (d) => (d > 0 ? "▲" : d < 0 ? "▼" : "＝");
  if (formato === "porcentaje") {
    const d = Math.round((valor - previo) * 10) / 10;
    return { delta: d, texto: `${signo(d)} ${Math.abs(d).toLocaleString("es-CO")} pts vs ${etiqueta}` };
  }
  if (!previo) return null;
  const pct = Math.round(((valor - previo) / previo) * 1000) / 10;
  return { delta: pct, texto: `${signo(pct)} ${Math.abs(pct).toLocaleString("es-CO")} % vs ${etiqueta}` };
}

async function renderBloqueKpi(b, records, aggregates, sufijo, periodo, ctx = {}) {
  const def = KPI_METRICAS[b.metrica] || KPI_METRICAS.totalValorConIva;
  const general = def.general ? presupuestoGeneral(ctx, periodo) : null;
  const valor = def.general ? (general ? general[def.general] : null) : resolveKpiValue(b.metrica, records, aggregates);
  const texto = fmtKpiValue(valor, def.formato);
  let variacion = null;
  if (!def.general && b.comparar !== false && ctx.prevRecords && ctx.prevRecords.length) {
    const previo = resolveKpiValue(b.metrica, ctx.prevRecords, ctx.prevAggregates);
    variacion = variacionKpi(valor, previo, def.formato, ctx.etiquetaPrev);
  }
  const base = `${def.label}${sufijo}: ${texto}${variacion ? ` (${variacion.texto})` : ""}.`;
  const contenido = await conAnalisisIa(b, base, { tipoOrigen: "kpi", metrica: b.metrica, periodo });
  // "_origen" es solo una etiqueta interna (no afecta el correo ni el PDF de
  // los informes normales): el PDF del informe tipo "Dashboard" la usa para
  // agrupar los KPI en una cuadrícula en vez de mostrarlos en lista (ver
  // generateReportPdfBuffer, opción dashboardLayout).
  return { titulo: b.titulo || `${def.label}${sufijo}`, contenido, destacado: texto, grafico: null, tabla: null, _origen: "kpi", _metrica: b.metrica || "totalValorConIva", variacion };
}

// "Los últimos N días" en una sección: usa los registros de los últimos N días hasta hoy (o la fecha de referencia),
// sin importar el período del informe. Devuelve los registros a usar y el sufijo del título.
function recortarUltimosDias(b, records, sufijo, ctx) {
  const n = Math.round(Number(b.ultimosDias) || 0);
  if (!n || n < 1 || !ctx?.allRecords) return { records, sufijo, dias: null };
  const hoy = ctx.ahora || new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (Math.min(n, 120) - 1));
  const d0 = ymd(desde);
  const d1 = ymd(hoy);
  return {
    records: ctx.allRecords.filter((r) => r.fechaSolicitud && r.fechaSolicitud.slice(0, 10) >= d0 && r.fechaSolicitud.slice(0, 10) <= d1),
    sufijo: ` (últimos ${n} días)`,
    dias: { desde, n: Math.min(n, 120) },
  };
}

// Con "últimos N días" agrupados por día, los días sin compras también aparecen (en 0).
function completarDias(grupos, dias) {
  if (!dias) return grupos;
  const porNombre = new Map(grupos.map((g) => [g.nombre, g]));
  const out = [];
  for (let i = 0; i < dias.n; i++) {
    const d = new Date(dias.desde.getFullYear(), dias.desde.getMonth(), dias.desde.getDate() + i);
    const nombre = `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
    out.push(porNombre.get(nombre) || { nombre, cantidad: 0, valorConIva: 0 });
  }
  return out;
}

async function renderBloqueGrafico(b, recordsPeriodo, sufijoPeriodo, periodo, ctx) {
  const { records, sufijo, dias } = recortarUltimosDias(b, recordsPeriodo, sufijoPeriodo, ctx);
  const campo = b.agruparPor || "area";
  const metrica = b.metricaAgrupada === "cantidad" ? "cantidad" : "valorConIva";
  const etiquetaCampo = AGRUPAR_LABELS[campo] || campo;
  const cronologico = AGRUPACIONES_CRONOLOGICAS.includes(campo);
  if (METRICAS_VALORACION[b.metricaAgrupada]) return renderGraficoValoracion(b, records, sufijo, periodo, campo);
  // Columnas apiladas (tiempo × serie), p. ej. "valor de compras por área y mes".
  if (cronologico && b.serie && AGRUPAR_LABELS[b.serie] && !AGRUPACIONES_CRONOLOGICAS.includes(b.serie)) {
    const { series, datos } = groupTiempoPorSerie(records, campo, b.serie, metrica);
    const titulo = b.titulo || `Por ${AGRUPAR_LABELS[b.serie]} y ${etiquetaCampo}${sufijo}`;
    if (!datos.length) return { titulo, contenido: "No hay compras registradas en este periodo.", destacado: null, grafico: null, tabla: null };
    const pico = datos.reduce((m, d) => (d.valor > m.valor ? d : m), datos[0]);
    const contenido = await conAnalisisIa(b, `${metrica === "valorConIva" ? "Valor comprado" : "Cantidad de compras"} por ${etiquetaCampo}, dividido por ${AGRUPAR_LABELS[b.serie]}${sufijo}. Las 5 de mayor ${metrica === "valorConIva" ? "valor" : "cantidad"} van con su nombre; el resto, en "Otras".`, { tipoOrigen: "grafico", agruparPor: b.serie, metricaAgrupada: b.metricaAgrupada, periodo });
    return {
      titulo,
      contenido,
      destacado: `Pico: ${pico.etiqueta} · ${metrica === "valorConIva" ? fmtMoneda(pico.valor) : `${pico.valor} compra(s)`}`,
      grafico: { titulo, tipo: "apiladas", datos, series, metrica, promedio: b.promedio !== false },
      _agruparPor: campo,
      tabla: null,
    };
  }
  const limiteGrupos = Math.min(Number(b.limite) || 8, 15);
  // "orden": "menor" muestra los de MENOR valor/cantidad (por defecto los de mayor); se ordena sobre todos los grupos y luego se recorta.
  const grupos = campo === "dia"
    ? completarDias(agruparRegistros(records, campo, 8), dias)
    : b.orden === "menor" && !cronologico
      ? agruparRegistros(records, campo, 100000).filter((g) => g[metrica] > 0).sort((a, x) => a[metrica] - x[metrica]).slice(0, limiteGrupos)
      : agruparRegistros(records, campo, limiteGrupos);
  if (grupos.length === 0) {
    return { titulo: b.titulo || `Por ${etiquetaCampo}${sufijo}`, contenido: "No hay compras registradas en este periodo.", destacado: null, grafico: null, tabla: null };
  }
  const datos = grupos.map((g) => ({ etiqueta: g.nombre, valor: g[metrica] }));
  // En una agrupación por tiempo lo que destaca es el pico (no el primero de la lista).
  const top = cronologico ? datos.reduce((m, d) => (d.valor > m.valor ? d : m), datos[0]) : datos[0];
  const fmtTop = metrica === "valorConIva" ? fmtMoneda(top.valor) : `${top.valor} compra(s)`;
  const destacado = cronologico ? `Pico: ${top.etiqueta} · ${fmtTop}` : `${top.etiqueta}: ${fmtTop}`;
  const tipoGrafico = ["dona", "columnas", "linea", "barras"].includes(b.estilo) ? b.estilo : cronologico ? "columnas" : "barras";
  const contextoIa = { tipoOrigen: "grafico", agruparPor: campo, metricaAgrupada: b.metricaAgrupada, periodo };
  const contenido = await conAnalisisIa(b, `Comparación de ${metrica === "valorConIva" ? "valor comprado" : "cantidad de compras"} por ${etiquetaCampo}${sufijo}.`, contextoIa);
  return {
    titulo: b.titulo || `Por ${etiquetaCampo}${sufijo}`,
    contenido,
    destacado,
    grafico: { titulo: b.titulo || "Comparación", tipo: tipoGrafico, datos, metrica, promedio: b.promedio !== false && (tipoGrafico === "columnas" || tipoGrafico === "linea") },
    _agruparPor: campo === "compra" ? undefined : campo,
    tabla: null,
  };
}

async function renderBloqueTabla(b, recordsPeriodo, sufijoPeriodo, periodo, ctx) {
  const { records, sufijo } = recortarUltimosDias(b, recordsPeriodo, sufijoPeriodo, ctx);
  const campo = b.agruparPor || "area";
  const etiquetaCampo = AGRUPAR_LABELS[campo] || campo;
  const grupos = agruparRegistros(records, campo, 15);
  if (grupos.length === 0) {
    return { titulo: b.titulo || `Resumen por ${etiquetaCampo}${sufijo}`, contenido: "No hay compras registradas en este periodo.", destacado: null, grafico: null, tabla: null };
  }
  const totalValor = records.reduce((s, r) => s + (r.valorConIva || 0), 0);
  const columnas = [etiquetaCampo.charAt(0).toUpperCase() + etiquetaCampo.slice(1), "Cantidad", "Valor", "% del total"];
  const filas = grupos.map((g) => [
    g.nombre,
    String(g.cantidad),
    fmtMoneda(g.valorConIva),
    totalValor ? `${Math.round((g.valorConIva / totalValor) * 1000) / 10}%` : "—",
  ]);
  const contextoIa = { tipoOrigen: "tabla", agruparPor: campo, periodo };
  const contenido = await conAnalisisIa(b, `Desglose de compras por ${etiquetaCampo}${sufijo}.`, contextoIa);
  return {
    titulo: b.titulo || `Resumen por ${etiquetaCampo}${sufijo}`,
    contenido,
    destacado: null,
    grafico: null,
    tabla: { columnas, filas },
  };
}

// El bloque "ia" solo guarda la pregunta (y, si vino del botón "Agregar
// análisis de IA" de un bloque kpi/grafico/tabla, su "contexto") — la
// pregunta se ejecuta contra la IA AQUÍ, al generar el informe (vista previa,
// envío manual o programado), no al agregar el bloque en el editor. Así
// siempre responde con datos frescos del momento del envío, igual que
// kpi/grafico/tabla (ver generateBloqueIaContent).
// Caché corta de los bloques de Nova: el editor regenera la vista previa a cada cambio y no tiene sentido volver a
// preguntarle a la IA lo mismo sobre los mismos datos. Expira a los 10 minutos (los envíos programados ocurren mucho
// después, así que siempre salen con datos frescos).
const iaCache = globalThis.__reportIaCache || (globalThis.__reportIaCache = new Map());
const IA_CACHE_MS = 10 * 60 * 1000;

async function iaConCache(pregunta, contexto) {
  const key = JSON.stringify([pregunta, contexto, alcanceActual.getStore() || null]);
  const hit = iaCache.get(key);
  if (hit && Date.now() - hit.at < IA_CACHE_MS) return hit.value;
  const value = await generateBloqueIaContent(pregunta, contexto);
  iaCache.set(key, { at: Date.now(), value });
  if (iaCache.size > 200) iaCache.delete(iaCache.keys().next().value);
  return value;
}

// ---------- Secciones de Nova en lote ----------
// Antes cada sección de Nova era una llamada a la IA que mandaba otra vez los mismos datos del período (4 secciones =
// 4 llamadas + 1 para el resumen del correo). Ahora:
//  1. Todas las secciones de Nova del informe (y, si se pide, el resumen del correo) salen en UNA sola llamada, con los
//     datos del período enviados una vez.
//  2. Cada texto queda guardado con la "huella" de los datos que lo produjeron (hash de los datos + la pregunta). Si al
//     volver a generar los datos no cambiaron (vista previa, otra prueba, reponer un período), se reutiliza sin llamar
//     a la IA; solo se piden las secciones nuevas o cambiadas. La huella también se guarda en el contenido de cada
//     edición (content._ia), así sobrevive a reinicios del servidor (ver reportEdiciones.js).
const IA_VERSION = "lote-1"; // súbela si cambian las instrucciones, para no reutilizar textos viejos
const IA_HUELLA_MS = 24 * 60 * 60 * 1000;
const iaHuellas = globalThis.__reportIaHuellas || (globalThis.__reportIaHuellas = new Map());

export const huella = (s) => createHash("sha1").update(String(s)).digest("hex").slice(0, 20);

function huellaGet(k, previas) {
  const hit = iaHuellas.get(k);
  if (hit && Date.now() - hit.at < IA_HUELLA_MS) return hit.value;
  return previas?.[k] || null;
}
function huellaSet(k, value) {
  iaHuellas.set(k, { at: Date.now(), value });
  if (iaHuellas.size > 500) iaHuellas.delete(iaHuellas.keys().next().value);
}

const IA_LOTE_SCHEMA = {
  type: "OBJECT",
  properties: {
    respuestas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { n: { type: "NUMBER" }, contenido: { type: "STRING" }, destacado: { type: "STRING", nullable: true } },
        required: ["n", "contenido"],
      },
    },
    resumenCorreo: { type: "STRING", nullable: true },
  },
  required: ["respuestas"],
};

const IA_LOTE_SYSTEM_INSTRUCTION = `Eres Nova y redactas las secciones de texto de un informe de compras (el resto del informe son cifras, gráficas y tablas que el sistema calcula aparte). Te entregan los datos exactos del período UNA vez y una lista numerada de secciones, cada una con la instrucción de qué escribir. Devuelve en "respuestas" una entrada por sección con su mismo número "n": "contenido" de 2 a 5 líneas en español (usa "- " para viñetas si ayuda a la lectura) y "destacado" opcional (una cifra clave, ej. "$42.300.000" o "6 compras", o null). Cada sección debe aportar algo distinto: no repitas lo que dice otra.

Reglas estrictas: basa cualquier cifra, suma, conteo o porcentaje EXCLUSIVAMENTE en los "agregados" (calculados sobre el 100% de los datos, son exactos); la "muestra" de registros es solo para citar ejemplos puntuales, nunca para calcular totales. Si un dato no está en los agregados ni se deriva de ellos con certeza, dilo en vez de inventarlo. Nunca inventes cifras, proveedores, fechas ni datos. Sé conciso.`;

const RESUMEN_CORREO_INSTRUCCION = `Además, en "resumenCorreo" escribe el resumen corto que va en el cuerpo del correo que acompaña el informe en PDF: 2 o 3 frases, español de Colombia, tono profesional y cordial, sin saludo ni despedida, empezando en minúscula porque va después de "En resumen:". Solo cifras de los agregados.`;

// preguntas: textos de las secciones de Nova en orden. Devuelve { respuestas: [{contenido, destacado}|{error}], resumen,
// mapa } — mapa son las huellas usadas, para guardarlas en el contenido de la edición.
export async function resolverIaEnLote(preguntas, { periodo, excluirAnulados, ahora, previas = {}, conResumen = false }) {
  const datos = await datosDelPeriodoTexto({ periodo: periodo || "historico", excluirAnulados: !!excluirAnulados, ahora }, 40);
  const hDatos = huella(datos);
  const claves = preguntas.map((p) => huella(`${IA_VERSION}|${hDatos}|${String(p).trim()}`));
  const claveResumen = huella(`${IA_VERSION}|${hDatos}|resumen`);
  const valores = {};
  const faltan = [];
  claves.forEach((k, i) => {
    const hit = huellaGet(k, previas);
    if (hit) valores[k] = hit;
    else if (!faltan.some((j) => claves[j] === k)) faltan.push(i);
  });
  let resumen = conResumen ? huellaGet(claveResumen, previas)?.texto || null : null;
  const pedirResumen = conResumen && !resumen;
  let errorLote = null;

  if (faltan.length || pedirResumen) {
    try {
      const out = await generateStructuredJson({
        systemInstruction: IA_LOTE_SYSTEM_INSTRUCTION,
        prompt: `${datos}

Secciones a redactar:
${faltan.length ? faltan.map((i, n) => `${n + 1}. """${preguntas[i]}"""`).join("\n") : "(ninguna: devuelve respuestas vacías)"}${pedirResumen ? `\n\n${RESUMEN_CORREO_INSTRUCCION}` : ""}`,
        schema: IA_LOTE_SCHEMA,
        budgetMs: 60000,
      });
      for (const r of out.respuestas || []) {
        const i = faltan[Math.round(Number(r.n)) - 1];
        if (i == null || !r.contenido) continue;
        const v = { contenido: String(r.contenido).trim(), destacado: r.destacado || null };
        valores[claves[i]] = v;
        huellaSet(claves[i], v);
      }
      if (pedirResumen && out.resumenCorreo?.trim()) {
        resumen = out.resumenCorreo.trim();
        huellaSet(claveResumen, { texto: resumen });
      }
    } catch (err) {
      errorLote = err.message || "error de la IA";
    }
  }

  const mapa = {};
  claves.forEach((k) => { if (valores[k]) mapa[k] = valores[k]; });
  if (resumen) mapa[claveResumen] = { texto: resumen };
  return {
    respuestas: claves.map((k) => valores[k] || { error: errorLote || "Nova no devolvió esta sección" }),
    resumen,
    mapa,
  };
}

async function renderBloqueIa(b, periodo, excluirAnulados, ahora) {
  if (!b.pregunta || !b.pregunta.trim()) {
    return { titulo: b.titulo || "Análisis con IA", contenido: "(Este bloque no tiene una pregunta configurada.)", destacado: null, grafico: null, tabla: null };
  }
  try {
    // Sin un contexto propio, la pregunta se responde sobre el MISMO período del informe (no sobre todo el histórico).
    const contexto = b.contexto || { tipoOrigen: "general", periodo: periodo || "historico", excluirAnulados: !!excluirAnulados, ...(ahora && ymd(ahora) !== ymd(new Date()) ? { ahora: ymd(ahora) } : {}) };
    const res = await iaConCache(b.pregunta, contexto);
    return { titulo: b.titulo || "Análisis con IA", contenido: res.contenido, destacado: res.destacado || null, grafico: null, tabla: null };
  } catch (err) {
    return { titulo: b.titulo || "Análisis con IA", contenido: `(No se pudo generar este análisis con IA: ${err.message})`, destacado: null, grafico: null, tabla: null };
  }
}

// Secciones del informe tipo "Dashboard" (ver DASHBOARD_SECCIONES en
// ReportBloqueBuilder.jsx) que no encajan en el modelo kpi/grafico/tabla por
// agrupación — presupuesto vs. gastado y solicitudes pendientes son vistas
// propias del Dashboard con su propia lógica, igual de determinísticas
// (ningún dato inventado), solo que no agrupan por un campo de "records".
function renderBloquePresupuesto(b, aggregates, sufijo) {
  const areas = Object.entries(aggregates.presupuesto || {});
  if (areas.length === 0) {
    return { titulo: b.titulo || `Presupuesto vs. gastado${sufijo}`, contenido: "No hay presupuesto configurado para el año.", destacado: null, grafico: null, tabla: null };
  }
  const columnas = ["Área", "Presupuestado", "Gastado", "% gastado"];
  const filas = areas.map(([area, p]) => [
    area, fmtMoneda(p.presupuestado), fmtMoneda(p.gastado), p.porcentajeGastado != null ? `${p.porcentajeGastado}%` : "—",
  ]);
  return {
    titulo: b.titulo || `Presupuesto vs. gastado${sufijo}`,
    contenido: "Comparación entre el presupuesto configurado y lo gastado por área (año en curso).",
    destacado: null, grafico: null, tabla: { columnas, filas },
  };
}

function renderBloquePendientes(b, records, sufijo) {
  const pendientes = records.filter((r) => !r.fechaEntrega && (!r.estado || r.estado === "Pendiente" || r.estado === "Proceso"));
  if (pendientes.length === 0) {
    return { titulo: b.titulo || `Solicitudes pendientes${sufijo}`, contenido: "No hay solicitudes pendientes de entrega en este periodo.", destacado: null, grafico: null, tabla: null };
  }
  const columnas = ["Descripción", "Área", "Responsable", "F. solicitud"];
  const filas = pendientes.slice(0, 15).map((r) => [r.descripcion || "—", r.area || "—", r.responsable || "—", r.fechaSolicitud || "—"]);
  return {
    titulo: b.titulo || `Solicitudes pendientes${sufijo}`,
    contenido: `${pendientes.length} solicitud(es) sin entregar en este periodo.`,
    destacado: null, grafico: null, tabla: { columnas, filas },
  };
}

// ---- Bloques del Estudio de informes ----

// Detalle de compras: TODAS las compras del período (y del alcance del informe), una por fila, de la más reciente a la
// más antigua, con el total al final. En pantalla es una tabla paginada y ordenable; en el PDF continúa en las páginas
// que haga falta (drawDetalleCompras en reportPdf.js). Tope de filas para que un informe sin filtro no pese demasiado.
export const MAX_DETALLE_COMPRAS = 1000;
function renderBloqueDetalleCompras(b, records, sufijo) {
  const titulo = b.titulo || `Detalle de compras${sufijo}`;
  if (!records.length) return { titulo, contenido: "No hay compras en este período.", destacado: null, grafico: null, tabla: null, _origen: "detalleCompras" };
  const ordenadas = [...records].sort((x, y) => String(y.fechaSolicitud || "").localeCompare(String(x.fechaSolicitud || "")) || (y.localSeq || 0) - (x.localSeq || 0));
  const total = records.reduce((s, r) => s + (r.valorConIva || 0), 0);
  const visibles = ordenadas.slice(0, MAX_DETALLE_COMPRAS);
  const columnas = ["#", "Fecha", "Descripción", "Proveedor", "Área", "Estado", "Valor con IVA"];
  const filas = visibles.map((r) => [r.localSeq != null ? `#${r.localSeq}` : "—", r.fechaSolicitud || "—", r.descripcion || "—", r.proveedor || "—", r.area || "—", r.estado || "—", fmtMoneda(r.valorConIva || 0)]);
  return {
    titulo,
    destacado: `${records.length.toLocaleString("es-CO")} compra(s) · ${fmtMoneda(total)}`,
    contenido: records.length > visibles.length
      ? `Se muestran las ${visibles.length.toLocaleString("es-CO")} compras más recientes de ${records.length.toLocaleString("es-CO")}; el total es de todas.`
      : "Todas las compras del período, de la más reciente a la más antigua.",
    grafico: null,
    tabla: { columnas, filas, total: ["Total", "", `${records.length.toLocaleString("es-CO")} compra(s)`, "", "", "", fmtMoneda(total)] },
    _origen: "detalleCompras",
  };
}

function diasDeRegistro(r) {
  if (!r.fechaSolicitud) return null;
  return r.fechaEntrega ? businessDaysBetween(r.fechaSolicitud, r.fechaEntrega) : businessDaysElapsedToToday(r.fechaSolicitud);
}

// Compras que superaron el plazo de 8 días hábiles: entregadas tarde y las que siguen sin entregar ya vencidas.
function renderBloqueFueraPlazo(b, records, sufijo) {
  const filas = [];
  for (const r of records) {
    if (r.estado === "Anulado") continue;
    const dias = diasDeRegistro(r);
    if (dias != null && dias > SLA_DIAS_HABILES) filas.push({ r, dias, entregada: !!r.fechaEntrega });
  }
  filas.sort((a, x) => x.dias - a.dias);
  const titulo = b.titulo || `Compras fuera de plazo${sufijo}`;
  if (!filas.length) {
    return { titulo, contenido: `Ninguna compra superó los ${SLA_DIAS_HABILES} días hábiles en este período.`, destacado: "0 compras", grafico: null, tabla: null, _total: 0 };
  }
  const pendientes = filas.filter((x) => !x.entregada).length;
  return {
    titulo,
    contenido: `${filas.length} compra(s) superaron los ${SLA_DIAS_HABILES} días hábiles${pendientes ? `, ${pendientes} de ellas todavía sin entregar` : ""}. La más larga lleva ${filas[0].dias} días hábiles.`,
    destacado: `${filas.length} compra(s)`,
    grafico: null,
    tabla: {
      columnas: ["#", "Descripción", "Área", "Días háb.", "Estado"],
      filas: filas.slice(0, 15).map(({ r, dias, entregada }) => [r.localSeq ? String(r.localSeq) : "—", r.descripcion || r.informe || "—", r.area || "—", String(dias), entregada ? "Entregada tarde" : "Sin entregar"]),
    },
    _total: filas.length,
  };
}

// Proveedores con la peor valoración de Nova en las compras del período (promedio del puntaje de proveedor).
async function renderBloqueProveedoresValoracion(b, records, sufijo) {
  const titulo = b.titulo || `Proveedores a revisar${sufijo}`;
  const ids = records.map((r) => r.id);
  const vals = ids.length
    ? await prisma.valoracionCompra.findMany({ where: { recordId: { in: ids }, puntajeProveedor: { not: null } }, select: { puntajeProveedor: true, recordId: true } })
    : [];
  if (!vals.length) return { titulo, contenido: "No hay compras valoradas por Nova en este período.", destacado: null, grafico: null, tabla: null };
  const porId = new Map(records.map((r) => [r.id, r]));
  const grupos = new Map();
  for (const v of vals) {
    const r = porId.get(v.recordId);
    const nombre = r?.proveedor || "Sin proveedor";
    if (!grupos.has(nombre)) grupos.set(nombre, { nombre, xs: [], valor: 0 });
    const g = grupos.get(nombre);
    g.xs.push(v.puntajeProveedor);
    g.valor += r?.valorConIva || 0;
  }
  const lista = [...grupos.values()]
    .map((g) => ({ ...g, promedio: g.xs.reduce((a, x) => a + x, 0) / g.xs.length }))
    .sort((a, x) => a.promedio - x.promedio || x.valor - a.valor);
  const bajos = lista.filter((g) => g.promedio <= 2);
  const umbral = Number(b.umbral) || 3;
  const mostrar = lista.filter((g) => g.promedio <= umbral).slice(0, 10);
  return {
    titulo,
    contenido: bajos.length
      ? `${bajos.length} proveedor(es) tienen una valoración de Nova de 2 o menos en este período; conviene revisarlos.`
      : `Ningún proveedor quedó con valoración de 2 o menos. Se listan los de ${umbral} o menos.`,
    destacado: `${bajos.length} proveedor(es) con 2★ o menos`,
    grafico: null,
    tabla: mostrar.length
      ? { columnas: ["Proveedor", "Valoración", "Compras", "Valor"], filas: mostrar.map((g) => [g.nombre, `${g.promedio.toFixed(1).replace(".", ",")} ★`, String(g.xs.length), fmtMoneda(g.valor)]) }
      : null,
  };
}

// Estado del ciclo anual de actualización de proveedores (no depende del período del informe).
async function renderBloqueCicloProveedores(b) {
  const ind = await indicadoresCiclo();
  const e = ind.estados || {};
  const corte = ind.diasParaCorte != null ? `; faltan ${ind.diasParaCorte} días para el corte` : "";
  const criticos = ind.criticos?.pendientes ? ` Hay ${ind.criticos.pendientes} proveedor(es) críticos pendientes.` : "";
  return {
    titulo: b.titulo || `Ciclo de proveedores ${ind.anio}`,
    contenido: `${ind.pctActualizado}% de los ${ind.enCiclo} proveedores del ciclo están actualizados${corte}.${criticos}`,
    destacado: `${ind.pctActualizado}% actualizados`,
    grafico: {
      titulo: "Estado del ciclo",
      tipo: b.estilo === "barras" ? "barras" : "dona",
      metrica: "cantidad",
      datos: [
        { etiqueta: "Actualizados", valor: e.actualizado || 0 },
        { etiqueta: "En aprobación", valor: e.en_aprobacion || 0 },
        { etiqueta: "En proceso", valor: e.en_proceso || 0 },
        { etiqueta: "Desactualizados", valor: e.desactualizado || 0 },
      ],
    },
    tabla: null,
  };
}

async function recordsDelInforme(excluirAnulados) {
  const { records, presupuestos } = await loadRecordsAndPresupuestos();
  return { base: excluirAnulados ? records.filter((r) => r.estado !== "Anulado") : records, presupuestos };
}

// "Cumplimiento de entregas" del Dashboard: de las compras entregadas, cuántas llegaron en 8 días hábiles o menos.
function renderBloqueCumplimientoEntregas(b, records, sufijo) {
  const t = buildTiemposEntrega(records.filter((r) => r.estado !== "Anulado"));
  const titulo = b.titulo || `Cumplimiento de entregas${sufijo}`;
  if (!t.totalEntregados) return { titulo, contenido: "No hubo compras entregadas en este período.", destacado: null, grafico: null, tabla: null };
  const no = t.totalEntregados - t.cumplieronSla;
  return {
    titulo,
    contenido: `${t.cumplieronSla} de ${t.totalEntregados} compras entregadas dentro de ${SLA_DIAS_HABILES} días hábiles${t.promedioDiasHabiles != null ? ` (promedio: ${String(t.promedioDiasHabiles).replace(".", ",")} días hábiles)` : ""}.`,
    destacado: `${String(t.cumplimientoPct).replace(".", ",")} % a tiempo`,
    grafico: { titulo, tipo: "dona", metrica: "cantidad", datos: [{ etiqueta: "Cumplió", valor: t.cumplieronSla }, { etiqueta: "No cumplió", valor: no }] },
    tabla: null,
  };
}

// "Ahorro por área" del Dashboard: valor cotizado vs. comprado por área (solo compras con cotización válida).
function renderBloqueAhorroArea(b, records, sufijo) {
  const titulo = b.titulo || `Ahorro por área${sufijo}`;
  const porArea = new Map();
  for (const r of records) {
    const a = r.area || "Sin área";
    if (!porArea.has(a)) porArea.set(a, { cot: 0, comp: 0, sinCot: 0 });
    const e = porArea.get(a);
    if (r.valorCot != null && r.valorConIva != null && !(r.valorCot > r.valorConIva * 20)) { e.cot += r.valorCot; e.comp += r.valorConIva; } else e.sinCot += 1;
  }
  const filas = [...porArea.entries()].map(([a, e]) => ({ a, ...e, ahorro: e.cot - e.comp, pct: e.cot ? Math.round(((e.cot - e.comp) / e.cot) * 1000) / 10 : null }))
    .sort((x, y) => y.ahorro - x.ahorro);
  if (!filas.length) return { titulo, contenido: "No hay compras en este período.", destacado: null, grafico: null, tabla: null };
  const total = filas.reduce((s, f) => s + f.ahorro, 0);
  return {
    titulo,
    contenido: "Ahorro = valor cotizado − valor comprado, por área. Las compras sin cotización válida no entran en el cálculo.",
    destacado: `Ahorro total: ${fmtMoneda(total)}`,
    grafico: { titulo, tipo: "barras", metrica: "valorConIva", datos: filas.filter((f) => f.cot).map((f) => ({ etiqueta: f.a, valor: Math.max(0, f.ahorro) })) },
    tabla: {
      columnas: ["Área", "Cotizado", "Comprado", "Ahorro", "% ahorro", "Sin cot."],
      filas: filas.map((f) => [f.a, fmtMoneda(f.cot), fmtMoneda(f.comp), fmtMoneda(f.ahorro), f.pct != null ? `${String(f.pct).replace(".", ",")} %` : "sin cotización", String(f.sinCot)]),
    },
  };
}

// "Consumo por categoría y área" del Dashboard: por área, lo del período, lo acumulado en el año, el presupuesto del
// año, lo disponible y el % consumido.
function renderBloqueConsumoCategoriaArea(b, records, sufijo, periodo, ctx) {
  const titulo = b.titulo || `Consumo por categoría y área${sufijo}`;
  const ahora = ctx?.ahora || new Date();
  const hasta = rangoPeriodo(periodo, 0, ahora)?.hasta || ymd(ahora);
  const anio = hasta.slice(0, 4);
  const acumulado = (ctx?.allRecords || []).filter((r) => r.fechaSolicitud && r.fechaSolicitud.slice(0, 4) === anio && r.fechaSolicitud.slice(0, 10) <= hasta);
  const presup = new Map((ctx?.presupuestos || []).filter((p) => String(p.anio) === anio).map((p) => [p.area, p.total || 0]));
  const areas = new Map();
  const tocar = (a) => { if (!areas.has(a)) areas.set(a, { cant: 0, mes: 0, acum: 0, cats: new Set() }); return areas.get(a); };
  for (const r of records) { const e = tocar(r.area || "Sin área"); e.cant += 1; e.mes += r.valorConIva || 0; if (r.categoria) e.cats.add(r.categoria); }
  for (const r of acumulado) tocar(r.area || "Sin área").acum += r.valorConIva || 0;
  const filas = [...areas.entries()].sort((x, y) => y[1].acum - x[1].acum).map(([a, e]) => {
    const p = presup.get(a);
    const pct = p ? Math.round((e.acum / p) * 1000) / 10 : null;
    return [a, String(e.cant), fmtMoneda(e.mes), fmtMoneda(e.acum), p ? fmtMoneda(p) : "—", p ? fmtMoneda(p - e.acum) : "—", pct != null ? `${String(pct).replace(".", ",")} %` : "—", [...e.cats].slice(0, 3).join(", ") || "—"];
  });
  if (!filas.length) return { titulo, contenido: "No hay compras en este período.", destacado: null, grafico: null, tabla: null };
  return {
    titulo,
    contenido: `Valor del período, acumulado de ${anio} y presupuesto del año por área. Desde el 80 % de consumo conviene vigilar el área; desde el 90 % está cerca del límite o excedida.`,
    destacado: null,
    grafico: null,
    tabla: { columnas: ["Área", "Cant.", "Del período", `Acumulado ${anio}`, `Presupuesto ${anio}`, "Disponible", "% consumido", "Categorías"], filas },
  };
}

// Cifras base de una edición, para compararla con otras (ver lib/reportEdiciones.js).
export async function resumenCifras(periodo, { excluirAnulados = true, ahora = new Date(), filtros = null } = {}) {
  const { base } = await conAlcance(filtros, () => recordsDelInforme(excluirAnulados));
  const records = filterRecordsByPeriodo(base, periodo, 0, ahora);
  return {
    valor: records.reduce((s, r) => s + (r.valorConIva || 0), 0),
    compras: records.length,
    cumplimientoPct: buildTiemposEntrega(records).cumplimientoPct,
    enProceso: records.filter((r) => !r.fechaEntrega).length,
    fueraPlazo: renderBloqueFueraPlazo({}, records, "")._total || 0,
  };
}

// ¿Se cumple la condición de envío del informe? (ver ReportConfig.condicion)
export async function evaluarCondicion(condicion, periodo, { excluirAnulados = true, ahora = new Date(), filtros = null } = {}) {
  if (!condicion || condicion === "siempre") return { cumple: true };
  const { base, presupuestos } = await conAlcance(filtros, () => recordsDelInforme(excluirAnulados));
  if (condicion === "presupuesto80") {
    const p = buildPresupuestoComparativo(base, presupuestos);
    const areas = Object.entries(p).filter(([, v]) => (v.porcentajeGastado || 0) >= 80).map(([a]) => a);
    return areas.length ? { cumple: true, detalle: areas.join(", ") } : { cumple: false, motivo: "Ninguna área superó el 80 % de su presupuesto." };
  }
  if (condicion === "fueraPlazo") {
    const n = renderBloqueFueraPlazo({}, filterRecordsByPeriodo(base, periodo, 0, ahora), "")._total || 0;
    return n ? { cumple: true } : { cumple: false, motivo: "No hubo compras fuera de plazo en el período." };
  }
  return { cumple: true };
}

const FORMULAS = {
  totalValorConIva: "Suma del valor con IVA de las compras",
  totalRegistros: "Cantidad de compras",
  totalSinLegalizar: "Compras cuyo estado de legalización no es Legalizado",
  cumplimientoPct: `Compras entregadas en ${SLA_DIAS_HABILES} días hábiles o menos ÷ compras entregadas`,
  promedioDiasHabiles: "Promedio de días hábiles entre la solicitud y la entrega",
  totalPendientesVencidos: `Compras sin entregar con más de ${SLA_DIAS_HABILES} días hábiles desde la solicitud`,
  ticketPromedio: "Valor con IVA total ÷ cantidad de compras",
  ahorroTotal: "Valor cotizado − valor comprado (solo compras con cotización válida)",
  pctAhorro: "Ahorro ÷ valor cotizado",
};

// "¿De dónde sale esta cifra?": cómo se calcula, cuántos registros la forman, el detalle por área, los registros
// principales y el valor del período anterior. Todo determinístico: sirve para verificar cualquier cifra del informe.
// Con agruparPor + etiqueta explica una barra o porción de una gráfica (solo los registros de ese grupo).
export async function cifraDetalle({ metrica, periodo, excluirAnulados = true, agruparPor, etiqueta, filtros = null }) {
  const { base, presupuestos } = await conAlcance(filtros, () => recordsDelInforme(excluirAnulados));
  const alcance = textoAlcance(filtros);
  const porGrupo = !!agruparPor && etiqueta != null && !AGRUPACIONES_CRONOLOGICAS.includes(agruparPor);
  const enGrupo = (r) => !porGrupo || (r[agruparPor] || "Sin dato") === etiqueta;
  const records = filterRecordsByPeriodo(base, periodo).filter(enGrupo);
  const key = KPI_METRICAS[metrica] ? metrica : "totalValorConIva";
  const def = KPI_METRICAS[key];
  const valor = def.general ? presupuestoGeneral({ presupuestos, allRecords: base }, periodo)?.[def.general] ?? null : resolveKpiValue(key, records, buildAggregates(records, presupuestos));
  const prev = filterRecordsByPeriodo(base, periodo, 1).filter(enGrupo);
  const etiquetaPrev = etiquetaPeriodoAnterior(periodo);
  const valorPrev = prev.length ? resolveKpiValue(key, prev, buildAggregates(prev, presupuestos)) : null;
  const porArea = Object.entries(countBy(records, "area"))
    .map(([area, v]) => ({ area, cantidad: v.cantidad, valor: v.valorConIva }))
    .sort((a, b) => b.valor - a.valor);
  const tiempos = key === "cumplimientoPct" || key === "promedioDiasHabiles" || key === "totalPendientesVencidos";
  const ordenados = tiempos
    ? records.map((r) => ({ r, dias: diasDeRegistro(r) })).filter((x) => x.dias != null).sort((a, b) => b.dias - a.dias)
    : [...records].sort((a, b) => (b.valorConIva || 0) - (a.valorConIva || 0)).map((r) => ({ r, dias: null }));
  const muestra = ordenados.slice(0, 8).map(({ r, dias }) => ({
    id: r.id, localSeq: r.localSeq, descripcion: r.descripcion || r.informe || "—", area: r.area || "—", valorConIva: r.valorConIva || 0, dias,
  }));
  const filtroPeriodo = PERIODO_LABELS[periodo] ? `Compras con fecha de solicitud en el ${PERIODO_LABELS[periodo]}` : "Todas las compras";
  return {
    metrica: key,
    label: def.label,
    valor,
    valorTexto: fmtKpiValue(valor, def.formato),
    formato: def.formato,
    formula: FORMULAS[key] || def.label,
    filtro: `${filtroPeriodo}${excluirAnulados ? ", sin las anuladas" : ""}${alcance ? ` · solo ${alcance}` : ""}${porGrupo ? ` · ${AGRUPAR_LABELS[agruparPor] || agruparPor}: ${etiqueta}` : ""}`,
    registros: records.length,
    porArea,
    muestra,
    tiempos,
    anterior: valorPrev != null
      ? { etiqueta: etiquetaPrev, valor: valorPrev, valorTexto: fmtKpiValue(valorPrev, def.formato), variacion: variacionKpi(valor, valorPrev, def.formato, etiquetaPrev) }
      : null,
  };
}

// Catálogo que Nova puede usar al armar o editar un informe (ver lib/reportNova.js).
export const CATALOGO_BLOQUES = {
  metricasKpi: Object.fromEntries(Object.entries(KPI_METRICAS).map(([k, v]) => [k, v.label])),
  agruparPor: AGRUPAR_LABELS,
  // Qué se puede medir en una gráfica (eje Y): valor, cantidad o el promedio de valoración de Nova.
  metricasGrafico: {
    valorConIva: "Valor comprado",
    cantidad: "Cantidad de compras",
    valoracionProveedor: "Valoración promedio del proveedor (Nova, 1 a 5)",
    valoracionCompra: "Valoración promedio de la compra (Nova, 1 a 5)",
  },
};

export { loadAggregates };

// Arma el informe de forma determinística a partir de los bloques que el
// usuario configuró manualmente en el constructor (ReportBloqueBuilder.jsx):
// kpi/grafico/tabla se calculan en JS directo sobre los datos reales (sin IA,
// sin posibilidad de inventar cifras); "texto" es lo que el usuario escribió
// a mano (o lo que trajo "generar borrador con IA"); "ia" ejecuta la pregunta
// puntual contra la IA en este mismo momento (ver renderBloqueIa arriba).
// sinIa: para los informes solo para consultar, los bloques "ia" muestran el texto que se guardó al diseñarlos
// (bloque.textoGuardado) en vez de volver a llamar a la IA. Todo lo demás se calcula con los datos del momento.
// previasIa: huellas de la edición anterior (content._ia) para reutilizar textos de Nova sobre los mismos datos.
// conResumen: aprovechar la misma llamada para el resumen del correo ({resumen_nova}); queda en content.resumenNova.
export async function renderReportFromBloques(bloques, { nombre, periodo, excluirAnulados = false, ahora = new Date(), sinIa = false, previasIa = {}, conResumen = false } = {}) {
  // El periodo es UNO SOLO para todo el informe (se eligió al inicio de
  // "Armar informe" en vez de uno por bloque) — se recalcula relativo a
  // "ahora" en cada generación (ver filterRecordsByPeriodo), nunca con una
  // fecha fija guardada. Aplica a kpi/grafico/tabla y a los placeholders
  // "{{...}}" dentro de los bloques de texto (ver interpolarTexto).
  const { records: todos, presupuestos } = await loadRecordsAndPresupuestos();
  const allRecords = excluirAnulados ? todos.filter((r) => r.estado !== "Anulado") : todos;
  const records = filterRecordsByPeriodo(allRecords, periodo, 0, ahora);
  const aggregates = buildAggregates(records, presupuestos);
  const sufijo = periodoSufijo(periodo);
  const prevRecords = filterRecordsByPeriodo(allRecords, periodo, 1, ahora);
  const ctx = { prevRecords, prevAggregates: buildAggregates(prevRecords, presupuestos), etiquetaPrev: etiquetaPeriodoAnterior(periodo, ahora), allRecords, ahora, presupuestos };

  // Las secciones de Nova sobre el período del informe (las del Estudio) salen todas juntas en una sola llamada.
  const enLote = sinIa ? [] : (bloques || []).map((b, i) => ({ b, i })).filter(({ b }) => b.tipo === "ia" && !b.contexto && b.pregunta?.trim());
  const lote = enLote.length
    ? await resolverIaEnLote(enLote.map(({ b }) => b.pregunta), { periodo, excluirAnulados, ahora: ymd(ahora) !== ymd(new Date()) ? ymd(ahora) : null, previas: previasIa, conResumen })
    : null;
  const deLote = new Map(enLote.map(({ i }, n) => [i, lote.respuestas[n]]));

  const secciones = await Promise.all((bloques || []).map((b, i) => {
    if (deLote.has(i)) {
      const r = deLote.get(i);
      return r.error
        ? { titulo: b.titulo || "Análisis de Nova", contenido: `(No se pudo generar este análisis con IA: ${r.error})`, destacado: null, grafico: null, tabla: null }
        : { titulo: b.titulo || "Análisis de Nova", contenido: r.contenido, destacado: r.destacado || null, grafico: null, tabla: null };
    }
    if (b.tipo === "ia" && sinIa) {
      return { titulo: b.titulo || "Análisis de Nova", contenido: b.textoGuardado || "(Este análisis se actualiza cuando quien creó el informe lo abre en el Estudio.)", destacado: b.destacadoGuardado || null, grafico: null, tabla: null, _textoGuardado: true };
    }
    if (b.tipo === "ia") return renderBloqueIa(b, periodo, excluirAnulados, ahora);
    if (b.tipo === "kpi") return renderBloqueKpi(b, records, aggregates, sufijo, periodo, ctx);
    if (b.tipo === "fueraPlazo") return renderBloqueFueraPlazo(b, records, sufijo);
    if (b.tipo === "proveedoresValoracion") return renderBloqueProveedoresValoracion(b, records, sufijo);
    if (b.tipo === "cicloProveedores") return renderBloqueCicloProveedores(b);
    if (b.tipo === "cumplimientoEntregas") return renderBloqueCumplimientoEntregas(b, records, sufijo);
    if (b.tipo === "ahorroArea") return renderBloqueAhorroArea(b, records, sufijo);
    if (b.tipo === "consumoCategoriaArea") return renderBloqueConsumoCategoriaArea(b, records, sufijo, periodo, ctx);
    if (b.tipo === "grafico") return renderBloqueGrafico(b, records, sufijo, periodo, ctx);
    if (b.tipo === "tabla") return renderBloqueTabla(b, records, sufijo, periodo, ctx);
    if (b.tipo === "presupuesto") return renderBloquePresupuesto(b, aggregates, sufijo);
    if (b.tipo === "pendientes") return renderBloquePendientes(b, records, sufijo);
    if (b.tipo === "detalleCompras") return renderBloqueDetalleCompras(b, records, sufijo);
    return renderBloqueTexto(b, aggregates);
  }));
  return {
    asunto: nombre || "Informe",
    saludo: "Buen día,",
    secciones,
    cierre: "Para más detalle, ingresa al Panel de Compras y Bienestar.",
    ...(textoAlcance() ? { alcance: textoAlcance() } : {}),
    ...(lote ? { _ia: lote.mapa, resumenNova: lote.resumen || null } : {}),
  };
}

const BLOQUE_IA_SCHEMA = {
  type: "OBJECT",
  properties: {
    contenido: { type: "STRING" },
    destacado: { type: "STRING", nullable: true },
  },
  required: ["contenido"],
};

const BLOQUE_IA_SYSTEM_INSTRUCTION = `Eres el asistente de IA de UN bloque dentro de un informe de compras que un administrador arma manualmente, bloque por bloque (el resto del informe puede tener bloques de KPI/gráfico/tabla calculados exactos, sin IA). Te hacen una pregunta puntual sobre los datos de compras; respondes con el contenido de ESE bloque: 2 a 5 líneas en español, usa "- " para viñetas si ayuda a la lectura. "destacado" es opcional: una cifra clave de la respuesta (ej. "$42.300.000" o "6 compras"), o null si no aplica.

Reglas estrictas: basa cualquier cifra, suma, conteo o porcentaje EXCLUSIVAMENTE en los "agregados" que te entregan (calculados sobre el 100% de los datos, son exactos) — la "muestra" de registros es solo para citar ejemplos puntuales (proveedor, área, descripción), nunca para calcular totales. Si el dato que piden no está en los agregados ni se puede derivar de ellos con certeza, dilo explícitamente en vez de inventarlo o calcularlo a ojo sobre la muestra. Nunca inventes cifras, proveedores, fechas ni datos que no estén en la información entregada. Sé conciso — esto es un solo bloque de un correo, no un documento extenso.`;

// Arma el recorte exacto de datos de un bloque kpi/grafico/tabla ya existente
// (mismo cálculo que renderBloqueKpi/Grafico/Tabla, con su mismo periodo) —
// usado por el botón "Agregar análisis de IA" de esos bloques (ver
// ReportBloqueBuilder.jsx), para que el análisis hable EXACTAMENTE de los
// datos que el bloque muestra, no de otro corte del dataset.
async function buildContextoDatos(contexto) {
  const { records: allRecords, presupuestos } = await loadRecordsAndPresupuestos();
  const records = filterRecordsByPeriodo(allRecords, contexto.periodo);
  const periodoLabel = PERIODO_LABELS[contexto.periodo] || "histórico completo";

  if (contexto.tipoOrigen === "kpi") {
    const def = KPI_METRICAS[contexto.metrica] || KPI_METRICAS.totalValorConIva;
    const aggregates = buildAggregates(records, presupuestos);
    const valor = resolveKpiValue(contexto.metrica, records, aggregates);
    return { tipo: "kpi", metrica: def.label, periodo: periodoLabel, valor: fmtKpiValue(valor, def.formato) };
  }

  const campo = contexto.agruparPor || "area";
  if (METRICAS_VALORACION[contexto.metricaAgrupada]) {
    const campoVal = AGRUPACIONES_CRONOLOGICAS.includes(campo) ? "proveedor" : campo;
    const { total, grupos: top } = await calcularGruposValoracion(records, { agruparPor: campoVal, metricaAgrupada: contexto.metricaAgrupada, orden: contexto.orden, limite: contexto.limite || 5 });
    return {
      tipo: contexto.tipoOrigen,
      agrupadoPor: AGRUPAR_LABELS[campoVal] || campoVal,
      metrica: `promedio de la ${VALORACION_LABELS[contexto.metricaAgrupada]} de Nova (de 1 a 5)`,
      orden: contexto.orden === "mayor" ? "de mayor a menor valoración" : "de menor a mayor valoración",
      periodo: periodoLabel,
      gruposConValoracion: total,
      datos: top.map((g) => ({ nombre: g.nombre, valoracionPromedio: Math.round(g.promedio * 10) / 10, comprasValoradas: g.compras, valorConIva: g.valor })),
    };
  }
  const grupos = groupRecordsBy(records, campo, contexto.tipoOrigen === "tabla" ? 15 : 8);
  return {
    tipo: contexto.tipoOrigen,
    agrupadoPor: AGRUPAR_LABELS[campo] || campo,
    metrica: contexto.metricaAgrupada === "cantidad" ? "cantidad de compras" : "valor comprado",
    periodo: periodoLabel,
    datos: grupos,
  };
}

// Genera (o regenera) el contenido de un bloque tipo "ia" dentro del
// constructor — el resultado se "congela" (se guarda en el bloque, ver
// bloque.contenidoCongelado) y de ahí en adelante se reutiliza tal cual al
// renderizar el informe (renderBloqueIa), sin volver a llamar a la IA en cada
// envío programado. "contexto" es opcional: lo manda el botón "Agregar
// análisis de IA" de un bloque kpi/grafico/tabla para que el análisis se
// base EXCLUSIVAMENTE en los datos exactos de ESE bloque; sin él, se
// comporta como una pregunta libre sobre todo el histórico (flujo original).
// Datos exactos del período de un informe, en texto, para los bloques de Nova. Va separado de la pregunta para poder
// mandarlo UNA sola vez aunque el informe tenga varios bloques de Nova (ver resolverIaEnLote).
async function datosDelPeriodoTexto({ periodo, excluirAnulados, ahora }, maxMuestra = MAX_RECORDS) {
  const { records: allRecords, presupuestos } = await loadRecordsAndPresupuestos();
  const base = excluirAnulados ? allRecords.filter((r) => r.estado !== "Anulado") : allRecords;
  const ref = ahora ? new Date(`${ahora}T12:00:00`) : new Date();
  const records = filterRecordsByPeriodo(base, periodo, 0, ref);
  const previos = filterRecordsByPeriodo(base, periodo, 1, ref);
  const etiquetaPrev = etiquetaPeriodoAnterior(periodo, ref);
  const previo = etiquetaPrev
    ? `\nAgregados exactos del período anterior (${etiquetaPrev}), para comparar:\n${JSON.stringify({ totalRegistros: previos.length, totalValorConIva: previos.reduce((s, r) => s + (r.valorConIva || 0), 0), porArea: countBy(previos, "area"), tiemposEntrega: buildTiemposEntrega(previos) })}\n`
    : "";
  const alcance = textoAlcance();
  return `Período del informe: ${PERIODO_LABELS[periodo] || "histórico completo"}${excluirAnulados ? " (sin compras anuladas)" : ""}.${alcance ? `\nALCANCE DEL INFORME: solo las compras de ${alcance}. Todas las cifras de abajo son solo de ese alcance; dilo así en lo que escribas.` : ""}
Agregados exactos del período:
${JSON.stringify(buildAggregates(records, presupuestos))}
${previo}
Muestra de registros del período (solo para ejemplos puntuales, no para totales):
${JSON.stringify(records.slice(-maxMuestra).map(compactRecord))}`;
}

export async function generateBloqueIaContent(pregunta, contexto) {
  let userPrompt;
  if (contexto && contexto.tipoOrigen === "general") {
    userPrompt = `Pregunta para este bloque del informe:
"""${pregunta}"""

${await datosDelPeriodoTexto(contexto)}`;
  } else if (contexto && contexto.tipoOrigen) {
    const datos = await buildContextoDatos(contexto);
    userPrompt = `Petición del administrador sobre este análisis:
"""${pregunta || "Escribe un análisis breve: qué destaca, qué está concentrado o disperso, y cualquier patrón relevante."}"""

Estos son TODOS los datos disponibles para este bloque (ya es el recorte exacto que el administrador configuró — no asumas que falta información ni pidas más):
${JSON.stringify(datos)}`;
  } else {
    const { aggregates, sample } = await loadAggregates();
    userPrompt = `Pregunta del administrador para este bloque del informe:
"""${pregunta}"""

Agregados exactos:
${JSON.stringify(aggregates)}

Muestra de registros recientes (solo para ejemplos puntuales, no para totales):
${JSON.stringify(sample)}`;
  }
  return generateStructuredJson({ systemInstruction: BLOQUE_IA_SYSTEM_INSTRUCTION, prompt: userPrompt, schema: BLOQUE_IA_SCHEMA });
}

const SUGERENCIA_BLOQUES_SCHEMA = {
  type: "OBJECT",
  properties: {
    periodoSugerido: { type: "STRING", nullable: true },
    bloques: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          tipo: { type: "STRING" },
          titulo: { type: "STRING" },
          metrica: { type: "STRING", nullable: true },
          agruparPor: { type: "STRING", nullable: true },
          metricaAgrupada: { type: "STRING", nullable: true },
          contenido: { type: "STRING", nullable: true },
          justificacion: { type: "STRING" },
        },
        required: ["tipo", "titulo", "justificacion"],
      },
    },
  },
  required: ["bloques"],
};

const SUGERENCIA_SYSTEM_INSTRUCTION = `Eres un analista que arma la ESTRUCTURA de un informe ejecutivo de compras — no inventas cifras, solo decides QUÉ bloques mostrar según lo que de verdad destaca en los "agregados" exactos que te entregan (calculados sobre el 100% del dataset real).

Tipos de bloque disponibles (usa EXACTAMENTE estos valores en "tipo"):
- "texto": un bloque introductorio breve (1-3 líneas) — usa "contenido" para el texto; no necesita más campos.
- "kpi": muestra un indicador clave. "metrica" debe ser EXACTAMENTE una de: totalValorConIva, totalRegistros, totalSinLegalizar, cumplimientoPct, promedioDiasHabiles, totalPendientesVencidos.
- "grafico": compara una métrica agrupada. "agruparPor" debe ser EXACTAMENTE una de: area, categoria, estado, estadoLegalizacion, proveedor. "metricaAgrupada" debe ser "valorConIva" o "cantidad".
- "tabla": desglose detallado. "agruparPor" igual que en "grafico" (sin "metricaAgrupada").

Para cada bloque, "justificacion" es una frase breve (se la mostramos al usuario) explicando por qué lo elegiste — basada en lo que realmente ves en los agregados entregados, nunca inventada.

Propón entre 4 y 8 bloques en total: normalmente un "texto" introductorio, 2-3 "kpi" con los indicadores más relevantes, 1-2 "grafico" de las agrupaciones con mayor concentración o variación de gasto, y opcionalmente 1 "tabla" si hay un desglose que valga destacar. Prioriza lo que realmente resalta en los datos (un área que concentra mucho gasto, un % de cumplimiento bajo, muchas compras sin legalizar, etc.) en vez de una lista genérica siempre igual.

"periodoSugerido" es opcional: una de historico, mes_actual, mes_anterior, anio_actual, anio_anterior (o null para dejar histórico completo) — solo si los datos recientes muestran algo distinto al histórico que valga la pena resaltar en todo el informe.`;

// Botón "Armar informe automáticamente con IA" (ver ReportEditor.jsx): la IA
// no inventa ninguna cifra — solo decide la ESTRUCTURA (qué bloques, con qué
// métrica/agrupación) según lo que realmente destaca en los agregados reales.
// Los bloques resultantes son kpi/grafico/tabla normales: sus valores se
// siguen calculando de forma 100% determinística al generar el informe (ver
// renderBloqueKpi/Grafico/Tabla), igual que si el usuario los hubiera armado
// a mano.
export async function generateBloquesSugeridos() {
  const { aggregates } = await loadAggregates();
  const prompt = `Agregados exactos de compras (calculados sobre el 100% de los datos):\n${JSON.stringify(aggregates)}`;
  return generateStructuredJson({ systemInstruction: SUGERENCIA_SYSTEM_INSTRUCTION, prompt, schema: SUGERENCIA_BLOQUES_SCHEMA, budgetMs: 30000 });
}

// Punto de entrada único usado por preview/send-now/reportScheduler: acepta el
// prompt legado como string suelto (compatibilidad hacia atrás) o un objeto
// {prompt, bloques, nombre}. Si trae bloques (al menos uno), el informe se
// arma de forma determinística/por bloques; si no, cae al flujo legado de un
// solo prompt para todo el informe.
export async function generateReportContent(reportOrPrompt) {
  if (typeof reportOrPrompt === "string") {
    return generateReportContentFromPrompt(reportOrPrompt);
  }
  const { prompt, bloques, nombre, periodoGeneral, excluirAnulados, ahora, sinIa, previasIa, conResumen, filtros } = reportOrPrompt || {};
  const parsedBloques = Array.isArray(bloques) ? bloques : (typeof bloques === "string" ? JSON.parse(bloques || "[]") : []);
  if (parsedBloques.length > 0) {
    return conAlcance(filtros, () => renderReportFromBloques(parsedBloques, { nombre, periodo: periodoGeneral, excluirAnulados: !!excluirAnulados, ahora: ahora || new Date(), sinIa: !!sinIa, previasIa: previasIa || {}, conResumen: !!conResumen }));
  }
  return generateReportContentFromPrompt(prompt);
}

