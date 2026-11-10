// Catálogos y utilidades del Estudio de informes (copia de las etiquetas que usa el backend en
// lib/reportContent.js#KPI_METRICAS / AGRUPAR_LABELS y lib/reportSchedule.js; sin dependencias de servidor).

export const PERIODOS = [
  { value: "mes_anterior", label: "El mes anterior completo", corto: "Mes anterior", ayuda: "En el envío de noviembre saldrá con octubre." },
  { value: "mes_actual", label: "Lo que va del mes", corto: "Mes en curso", ayuda: "Del día 1 hasta el día del envío." },
  { value: "semana_anterior", label: "La semana anterior", corto: "Semana anterior", ayuda: "De lunes a domingo previos." },
  { value: "anio_actual", label: "Lo que va del año", corto: "Año a la fecha", ayuda: "Acumulado de enero a la fecha." },
  { value: "anio_anterior", label: "El año anterior completo", corto: "Año anterior", ayuda: "Enero a diciembre del año pasado." },
  { value: "historico", label: "Todo el histórico", corto: "Histórico", ayuda: "Todas las compras registradas." },
];
export const periodoCorto = (v) => PERIODOS.find((p) => p.value === v)?.corto || "Histórico";

export const METRICAS = {
  totalValorConIva: "Valor total comprado",
  totalRegistros: "Total de compras",
  cumplimientoPct: "Cumplimiento de tiempos",
  promedioDiasHabiles: "Promedio días hábiles de entrega",
  totalPendientesVencidos: "Pendientes vencidas (fuera de plazo)",
  ticketPromedio: "Ticket promedio por compra",
  totalSinLegalizar: "Compras sin legalizar",
  ahorroTotal: "Ahorro total (cotizado vs. comprado)",
  pctAhorro: "% de ahorro global",
  enProceso: "Compras en proceso",
  valorCotizado: "Valor cotizado",
  valorCompraCotizados: "Valor compra (cotizados)",
  presupuestado: "Presupuestado (año)",
  gastadoAnio: "Gastado en el año",
  pctConsumido: "% consumido del presupuesto",
  disponible: "Presupuesto disponible",
};

export const AGRUPAR = {
  area: "Área", categoria: "Categoría", proveedor: "Proveedor", estado: "Estado", estadoLegalizacion: "Estado de legalización",
  responsable: "Responsable", medioPago: "Medio de pago", mes: "Mes", dia: "Día",
  compra: "Compra individual (top de compras)",
};

export const TIPOS_SECCION = {
  ia: "Análisis de Nova",
  texto: "Texto",
  kpi: "Cifra clave",
  grafico: "Gráfica",
  tabla: "Tabla",
  presupuesto: "Presupuesto",
  pendientes: "Sin entregar",
  fueraPlazo: "Fuera de plazo",
  proveedoresValoracion: "Proveedores a revisar",
  cicloProveedores: "Ciclo de proveedores",
  cumplimientoEntregas: "Cumplimiento de entregas",
  ahorroArea: "Ahorro por área",
  consumoCategoriaArea: "Consumo por categoría y área",
  detalleCompras: "Detalle de compras",
};

// Secciones que el usuario puede agregar a mano desde el editor.
export function bloqueNuevo(tipo) {
  switch (tipo) {
    case "texto": return { tipo, titulo: "Nota", contenido: "Escribe aquí el texto." };
    case "kpi": return { tipo, titulo: "Valor total comprado", metrica: "totalValorConIva" };
    case "grafico": return { tipo, titulo: "Gasto por área", agruparPor: "area", metricaAgrupada: "valorConIva", estilo: "barras" };
    case "tabla": return { tipo, titulo: "Compras por proveedor", agruparPor: "proveedor" };
    case "ia": return { tipo, titulo: "Análisis de Nova", pregunta: "Escribe un análisis breve de lo más importante del período." };
    case "fueraPlazo": return { tipo, titulo: "Compras fuera de plazo" };
    case "presupuesto": return { tipo, titulo: "Presupuesto vs. gastado por área" };
    case "proveedoresValoracion": return { tipo, titulo: "Proveedores a revisar", umbral: 3 };
    case "pendientes": return { tipo, titulo: "Solicitudes sin entregar" };
    case "cicloProveedores": return { tipo, titulo: "Ciclo de proveedores" };
    case "detalleCompras": return { tipo, titulo: "Detalle de compras" };
    default: return { tipo: "texto", titulo: "Nota", contenido: "" };
  }
}

export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const ORDINALES = [
  { value: 1, label: "Primer" }, { value: 2, label: "Segundo" }, { value: 3, label: "Tercer" }, { value: 4, label: "Cuarto" }, { value: -1, label: "Último" },
];
export const FRECUENCIAS = [
  { value: "mensual_semana", label: "Un día de la semana del mes (ej. primer lunes hábil)" },
  { value: "mensual", label: "Un día del mes (ej. el 5)" },
  { value: "ultimo_habil", label: "Último día hábil del mes" },
  { value: "semanal", label: "Cada semana" },
  { value: "diaria", label: "Cada día hábil" },
  { value: "unica", label: "Una sola vez" },
];
export const CONDICIONES = [
  { value: "siempre", label: "Siempre" },
  { value: "presupuesto80", label: "Solo si alguna área supera el 80 % de su presupuesto" },
  { value: "fueraPlazo", label: "Solo si hay compras fuera de plazo (más de 8 días hábiles)" },
];
export const VARIABLES = ["{nombre}", "{periodo}", "{mes}", "{año}", "{valor_total}", "{fecha_envio}", "{resumen_nova}"];

export const ESTADO_EDICION = {
  guardado: { label: "Foto guardada", cls: "" },
  por_enviar: { label: "Por enviar", cls: "warn" },
  enviado: { label: "Enviado", cls: "ok" },
  omitido: { label: "Omitido", cls: "off" },
  error: { label: "Con error", cls: "warn" },
};

export const PALETA = ["#2063a0", "#fb8500", "#8fc93a", "#00bcd4", "#d14343", "#a2a6ab", "#7b61ff", "#f4b400"];

export function fmtCompacto(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(n || 0);
}

export function fmtFechaCorta(iso, conHora = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}) });
}

// Informe vacío con lo mínimo para guardarlo como borrador.
export function informeBase(extra = {}) {
  return {
    nombre: "Informe sin título",
    tipo: "estudio",
    periodoGeneral: "mes_anterior",
    contexto: { audiencia: null, tono: "ejecutivo", excluirAnulados: true },
    bloques: [bloqueNuevo("ia")],
    destinatarios: [],
    cc: [],
    frecuencia: "mensual_semana",
    ordinal: 1,
    diaSemana: 1,
    hora: "08:00",
    saltarFestivos: true,
    condicion: "siempre",
    entrega: "yo",
    asunto: "{nombre} · {periodo}",
    mensaje: "Buen día,\n\nAdjunto el informe {nombre} de {periodo}. En resumen: {resumen_nova}\n\nQuedo atento a cualquier comentario.",
    esBorrador: true,
    ...extra,
  };
}

// Campos del informe que se guardan (lo demás —próxima fecha, textos calculados— lo devuelve el servidor).
export const CAMPOS_GUARDABLES = [
  "nombre", "tipo", "pedido", "contexto", "periodoGeneral", "bloques", "destinatarios", "cc", "frecuencia", "diaSemana", "diaMes", "ordinal",
  "fechaUnica", "hora", "saltarFestivos", "sabadoHabil", "domingoHabil", "condicion", "entrega", "responsables", "asunto", "mensaje", "reglaTexto", "esBorrador", "activo",
];

export function soloGuardable(inf) {
  const out = {};
  for (const k of CAMPOS_GUARDABLES) if (inf[k] !== undefined) out[k] = inf[k];
  return out;
}

// Secciones listas para agregar al informe (las mismas vistas del Dashboard, orientadas a compras). Cada una inserta
// uno o varios bloques ya configurados; luego se pueden ajustar en el panel o con Nova.
const G = (titulo, agruparPor, metricaAgrupada, estilo, extra = {}) => ({ tipo: "grafico", titulo, agruparPor, metricaAgrupada, estilo, ...extra });
const K = (titulo, metrica) => ({ tipo: "kpi", titulo, metrica });
const IA = (titulo, pregunta) => ({ tipo: "ia", titulo, pregunta });

export const SECCIONES_LISTAS = [
  {
    grupo: "Cifras clave",
    items: [
      { clave: "kpisMes", label: "Cifras clave (valor, compras, cumplimiento, ticket)", bloques: [K("Valor comprado", "totalValorConIva"), K("Compras", "totalRegistros"), K("Cumplimiento de tiempos", "cumplimientoPct"), K("Ticket promedio", "ticketPromedio")] },
      { clave: "kpisAhorro", label: "Ahorro frente a lo cotizado", bloques: [K("Ahorro total", "ahorroTotal"), K("% de ahorro", "pctAhorro")] },
      { clave: "kpisTiempos", label: "Tiempos de entrega (cumplimiento, promedio, vencidas)", bloques: [K("Cumplimiento de tiempos", "cumplimientoPct"), K("Promedio días hábiles", "promedioDiasHabiles"), K("Pendientes vencidas", "totalPendientesVencidos")] },
      { clave: "kpiSinLegalizar", label: "Compras sin legalizar", bloques: [K("Compras sin legalizar", "totalSinLegalizar")] },
      { clave: "kpisCotizacion", label: "Cotizado vs. comprado (total, cotizado, comprado, ahorro, %)", bloques: [K("Total compras", "totalRegistros"), K("Valor cotizado", "valorCotizado"), K("Valor compra (cotizados)", "valorCompraCotizados"), K("Ahorro total", "ahorroTotal"), K("% ahorro global", "pctAhorro")] },
      { clave: "kpisPresupuesto", label: "Presupuesto vs. gastado — nivel general", bloques: [K("Presupuestado", "presupuestado"), K("Gastado", "gastadoAnio"), K("% consumido", "pctConsumido"), K("Disponible", "disponible")] },
    ],
  },
  {
    grupo: "Valor y tendencia",
    items: [
      { clave: "valorMes", label: "Valor de compras por mes (columnas con promedio)", bloques: [G("Valor de compras por mes", "mes", "valorConIva", "columnas")] },
      { clave: "areaMes", label: "Valor de compras por área y mes (apiladas)", bloques: [G("Valor de compras por área y mes", "mes", "valorConIva", "apiladas", { serie: "area" })] },
      { clave: "categoriaMes", label: "Valor por categoría y mes (apiladas)", bloques: [G("Valor por categoría y mes", "mes", "valorConIva", "apiladas", { serie: "categoria" })] },
      { clave: "comprasMes", label: "Cantidad de compras por mes (línea)", bloques: [G("Cantidad de compras por mes", "mes", "cantidad", "linea")] },
      { clave: "comprasDia", label: "Compras por día (últimos 30 días)", bloques: [G("Compras por día", "dia", "cantidad", "columnas", { ultimosDias: 30 })] },
    ],
  },
  {
    grupo: "Distribución",
    items: [
      { clave: "participacionArea", label: "Participación por área (dona)", bloques: [G("Participación por área", "area", "valorConIva", "dona")] },
      { clave: "participacionCategoria", label: "Participación por categoría (dona)", bloques: [G("Participación por categoría", "categoria", "valorConIva", "dona")] },
      { clave: "estadoCompras", label: "Estado de las compras", bloques: [G("Estado de las compras", "estado", "cantidad", "dona")] },
      { clave: "estadoLegalizacion", label: "Estado de legalización", bloques: [G("Estado de legalización", "estadoLegalizacion", "cantidad", "barras")] },
      { clave: "mediosPago", label: "Medios de pago", bloques: [G("Medios de pago", "medioPago", "valorConIva", "dona")] },
      { clave: "porResponsable", label: "Compras por responsable", bloques: [G("Compras por responsable", "responsable", "cantidad", "barras")] },
    ],
  },
  {
    grupo: "Proveedores",
    items: [
      { clave: "topProveedores", label: "Top 5 proveedores por volumen de compra", bloques: [G("Top 5 proveedores por volumen de compra", "proveedor", "valorConIva", "barras", { limite: 5 })] },
      { clave: "topProveedoresValoracion", label: "Top 5 proveedores con menor valoración (Nova)", bloques: [G("Top 5 proveedores con menor valoración", "proveedor", "valoracionProveedor", "barras", { limite: 5, orden: "menor" })] },
      { clave: "tablaProveedores", label: "Tabla de compras por proveedor", bloques: [{ tipo: "tabla", titulo: "Compras por proveedor", agruparPor: "proveedor" }] },
      { clave: "proveedoresValoracion", label: "Proveedores a revisar (valoración de Nova)", bloques: [{ tipo: "proveedoresValoracion", titulo: "Proveedores a revisar", umbral: 3 }] },
      { clave: "cicloProveedores", label: "Ciclo de actualización de proveedores", bloques: [{ tipo: "cicloProveedores", titulo: "Ciclo de proveedores" }] },
    ],
  },
  {
    grupo: "Seguimiento",
    items: [
      { clave: "cumplimientoEntregas", label: "Cumplimiento de entregas (dona a tiempo / tarde)", bloques: [{ tipo: "cumplimientoEntregas", titulo: "Cumplimiento de entregas" }] },
      { clave: "ahorroArea", label: "Ahorro por área", bloques: [{ tipo: "ahorroArea", titulo: "Ahorro por área" }] },
      { clave: "consumoCategoriaArea", label: "Consumo por categoría y área (con presupuesto)", bloques: [{ tipo: "consumoCategoriaArea", titulo: "Consumo por categoría y área" }] },
      { clave: "fueraPlazo", label: "Compras fuera de plazo (más de 8 días hábiles)", bloques: [{ tipo: "fueraPlazo", titulo: "Compras fuera de plazo" }] },
      { clave: "pendientes", label: "Solicitudes sin entregar", bloques: [{ tipo: "pendientes", titulo: "Solicitudes sin entregar" }] },
      { clave: "detalleCompras", label: "Detalle de compras (cada compra del período, con el total)", bloques: [{ tipo: "detalleCompras", titulo: "Detalle de compras" }] },
      { clave: "presupuesto", label: "Presupuesto vs. gastado por área", bloques: [{ tipo: "presupuesto", titulo: "Presupuesto vs. gastado por área" }] },
      { clave: "tablaArea", label: "Tabla resumen por área", bloques: [{ tipo: "tabla", titulo: "Resumen por área", agruparPor: "area" }] },
      { clave: "tablaCategoria", label: "Tabla resumen por categoría", bloques: [{ tipo: "tabla", titulo: "Resumen por categoría", agruparPor: "categoria" }] },
    ],
  },
  {
    grupo: "Análisis de Nova",
    items: [
      { clave: "novaResumen", label: "Resumen ejecutivo", bloques: [IA("Resumen ejecutivo", "Escribe un resumen ejecutivo del período: cuánto se compró y cómo cambió frente al período anterior, cómo van los tiempos de entrega y qué conviene revisar. 3 a 5 líneas.")] },
      { clave: "novaVariacion", label: "Qué cambió frente al período anterior", bloques: [IA("Qué cambió y por qué", "Explica las principales variaciones frente al período anterior: qué áreas, categorías o proveedores explican el cambio en el valor comprado y en los tiempos. 3 a 5 líneas.")] },
      { clave: "novaRecomendaciones", label: "Recomendaciones", bloques: [IA("Recomendaciones", "Con base en las cifras del período, da 3 recomendaciones concretas para compras (tiempos, concentración de proveedores, legalizaciones pendientes). Usa viñetas.")] },
      { clave: "novaRiesgos", label: "Riesgos y alertas", bloques: [IA("Riesgos y alertas", "Señala los riesgos que muestran las cifras del período: compras vencidas, áreas con mucho gasto, proveedores concentrados o legalizaciones pendientes. Usa viñetas, máximo 4.")] },
    ],
  },
];

export const SECCION_LISTA_POR_CLAVE = Object.fromEntries(SECCIONES_LISTAS.flatMap((g) => g.items.map((i) => [i.clave, i])));
