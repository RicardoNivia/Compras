import { generateStructuredJson } from "@/lib/aiStructured";
import { listRecords } from "@/lib/records";
import { listPresupuestos } from "@/lib/presupuestos";
import { businessDaysBetween, businessDaysElapsedToToday } from "@/lib/businessDays";

// Mismo umbral que el KPI "Cumplimiento de tiempos" del Dashboard (ver
// DashboardView.jsx) — para que un informe que hable de tiempos de entrega
// use la misma definición de "a tiempo" en todo el panel.
const SLA_DIAS_HABILES = 8;

// Más bajo que el límite de "Explícame este número" (300): ahí el cliente ya
// manda el periodo filtrado; aquí siempre se parte del dataset completo, así
// que hay que recortar más para que el POST a Gemini no quede tan pesado que
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

const SYSTEM_INSTRUCTION = `Eres el redactor del Informe Ejecutivo automático del Panel de Compras de Sinco. Un administrador describe, en lenguaje natural, qué debe contener el informe periódico que se envía por correo. Tienes el set de registros de compra (JSON) para basarte en datos reales.

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
// POST a Gemini (ver MAX_RECORDS/MAX_MUESTRA más arriba).
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

// Totales exactos sobre el 100% de los registros — lo que el prompt le pide a
// Gemini que use para cualquier cifra, en vez de la muestra recortada (que
// puede no representar el dataset completo y llevaría a cifras incorrectas
// o a que el modelo diga "no se puede calcular" sin necesidad).
function buildAggregates(records, presupuestos) {
  const sinLegalizar = records.filter((r) => (r.estadoLegalizacion || "").toLowerCase() !== "legalizado");
  return {
    totalRegistros: records.length,
    totalValorConIva: records.reduce((s, r) => s + (r.valorConIva || 0), 0),
    totalValorSinIva: records.reduce((s, r) => s + (r.valorSinIva || 0), 0),
    totalSinLegalizar: sinLegalizar.length,
    sinLegalizarMuestra: sinLegalizar.slice(0, MAX_MUESTRA).map((r) => miniRecord(r, { estadoLegalizacion: r.estadoLegalizacion })),
    porArea: countBy(records, "area"),
    porEstado: countBy(records, "estado"),
    porCategoria: countBy(records, "categoria"),
    porEstadoLegalizacion: countBy(records, "estadoLegalizacion"),
    tiemposEntrega: buildTiemposEntrega(records),
    presupuesto: buildPresupuestoComparativo(records, presupuestos),
  };
}

// Genera el contenido estructurado del informe a partir del prompt del admin
// y los datos reales de compras — sin streaming, probando modelos en orden
// (Gemini y luego Anthropic, ver lib/aiStructured.js) hasta obtener
// respuesta. Se usa tanto para la vista previa como para el envío real, así
// ambas rutas comparten exactamente la misma lógica de generación.
export async function generateReportContent(prompt) {
  const anioActual = new Date().getFullYear();
  const [records, { presupuestos }] = await Promise.all([
    listRecords(),
    listPresupuestos({ anio: anioActual }),
  ]);
  const aggregates = buildAggregates(records, presupuestos);
  // Muestra para ejemplos puntuales: prioriza los más recientes (más
  // relevantes para un informe ejecutivo que una muestra arbitraria).
  const sample = [...records].reverse().slice(0, MAX_RECORDS).map(compactRecord);

  const userPrompt = `Instrucción del administrador sobre qué debe contener el informe:
"""${prompt}"""

Agregados exactos (calculados sobre los ${records.length} registros del dataset completo):
${JSON.stringify(aggregates)}

Muestra de registros más recientes (JSON, ${sample.length} de ${records.length}, solo para ejemplos puntuales — no para totales):
${JSON.stringify(sample)}`;

  return generateStructuredJson({ systemInstruction: SYSTEM_INSTRUCTION, prompt: userPrompt, schema: REPORT_SCHEMA });
}

