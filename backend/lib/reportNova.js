import { generateStructuredJson } from "@/lib/aiStructured";
import { CATALOGO_BLOQUES, loadAggregates } from "@/lib/reportContent";
import { FRECUENCIAS, describirProgramacion, proximasFechas } from "@/lib/reportSchedule";

// Nova dentro del Estudio de informes: arma un informe a partir de un pedido en lenguaje natural, lo edita
// conversando, convierte "el primer lunes hábil de cada mes a las 8" en una regla y redacta el mensaje del correo.
// Regla de oro: Nova decide la ESTRUCTURA y el texto, nunca las cifras. Los bloques kpi/grafico/tabla/fueraPlazo/
// proveedoresValoracion/cicloProveedores se calculan siempre con los datos reales (ver lib/reportContent.js) y los
// bloques "ia" responden sobre los agregados exactos del período del informe.

const TIPOS = ["texto", "kpi", "grafico", "tabla", "ia", "presupuesto", "pendientes", "fueraPlazo", "proveedoresValoracion", "cicloProveedores", "cumplimientoEntregas", "ahorroArea", "consumoCategoriaArea", "detalleCompras"];
const PERIODOS = ["historico", "mes_actual", "mes_anterior", "anio_actual", "anio_anterior", "semana_anterior"];

// ---------- Plantillas de un clic ----------

const RESUMEN = (texto) => ({ tipo: "ia", titulo: "Resumen ejecutivo", pregunta: texto });

const K = (titulo, metrica, extra = {}) => ({ tipo: "kpi", titulo, metrica, ...extra });
const G = (titulo, agruparPor, metricaAgrupada, estilo, extra = {}) => ({ tipo: "grafico", titulo, agruparPor, metricaAgrupada, estilo, ...extra });

export const PLANTILLAS = [
  {
    // Lo mismo que muestra el Dashboard de compras en la vista Mensual, en el mismo orden.
    clave: "dashboardMensual",
    nombre: "Dashboard mensual",
    descripcion: "Todo lo del Dashboard en vista mensual, en el mismo orden.",
    periodoGeneral: "mes_anterior",
    contexto: { audiencia: "Gerencia", tono: "ejecutivo" },
    bloques: [
      K("Valor del mes", "totalValorConIva"),
      K("Cumplimiento de tiempos", "cumplimientoPct"),
      K("En proceso", "enProceso", { comparar: false }),
      K("Ticket promedio", "ticketPromedio"),
      K("Total compras", "totalRegistros"),
      K("Valor cotizado", "valorCotizado"),
      K("Valor compra (cotizados)", "valorCompraCotizados"),
      K("Ahorro total", "ahorroTotal"),
      K("% ahorro global", "pctAhorro"),
      K("Presupuestado", "presupuestado"),
      K("Gastado", "gastadoAnio"),
      K("% consumido", "pctConsumido"),
      K("Disponible", "disponible"),
      { tipo: "cumplimientoEntregas", titulo: "Cumplimiento de entregas" },
      RESUMEN("Escribe el resumen ejecutivo del mes, como el del Dashboard: cuánto se compró y cómo cambió frente al mes anterior, cómo van los tiempos de entrega, el ahorro y lo que conviene revisar. 3 a 5 líneas."),
      { tipo: "pendientes", titulo: "Solicitudes pendientes" },
      G("Participación por área", "area", "valorConIva", "dona"),
      G("Participación por categoría", "categoria", "valorConIva", "dona"),
      G("Estado de la compra", "estado", "valorConIva", "barras"),
      K("Cumplimiento", "cumplimientoPct"),
      K("Pendientes en riesgo", "totalPendientesVencidos"),
      G("Medio de pago", "medioPago", "valorConIva", "dona"),
      G("Compras por área", "area", "valorConIva", "barras"),
      { tipo: "ahorroArea", titulo: "Ahorro por área" },
      G("Top 5 proveedores por volumen de compra", "proveedor", "valorConIva", "barras", { limite: 5 }),
      G("Compras por responsable", "responsable", "cantidad", "barras"),
      { tipo: "consumoCategoriaArea", titulo: "Consumo por categoría y área" },
    ],
  },
  {
    clave: "cierreMensual",
    nombre: "Cierre mensual de compras",
    descripcion: "Valor, cumplimiento de tiempos, en proceso y conclusiones.",
    periodoGeneral: "mes_anterior",
    contexto: { audiencia: "Gerencia", tono: "ejecutivo" },
    bloques: [
      RESUMEN("Escribe un resumen ejecutivo del mes para gerencia: cuánto se compró y cómo cambió frente al mes anterior, cómo van los tiempos de entrega y qué conviene revisar. 3 a 5 líneas."),
      { tipo: "kpi", titulo: "Valor del mes", metrica: "totalValorConIva" },
      { tipo: "kpi", titulo: "Compras", metrica: "totalRegistros" },
      { tipo: "kpi", titulo: "Cumplimiento de tiempos", metrica: "cumplimientoPct" },
      { tipo: "kpi", titulo: "Ticket promedio", metrica: "ticketPromedio" },
      { tipo: "grafico", titulo: "Gasto por área", agruparPor: "area", metricaAgrupada: "valorConIva", estilo: "dona" },
      { tipo: "fueraPlazo", titulo: "Compras fuera de plazo" },
      { tipo: "tabla", titulo: "Principales proveedores", agruparPor: "proveedor" },
    ],
  },
  {
    clave: "presupuestoArea",
    nombre: "Presupuesto por área",
    descripcion: "Consumo contra lo asignado, con las áreas en riesgo primero.",
    periodoGeneral: "anio_actual",
    contexto: { audiencia: "Comité", tono: "ejecutivo" },
    bloques: [
      RESUMEN("Resume cómo va el consumo del presupuesto del año por área: cuáles están cerca o por encima del límite (80% o más) y cuáles van holgadas. 3 a 4 líneas."),
      { tipo: "kpi", titulo: "Gastado en el año", metrica: "totalValorConIva" },
      { tipo: "presupuesto", titulo: "Presupuesto vs. gastado por área" },
      { tipo: "grafico", titulo: "Gasto por área", agruparPor: "area", metricaAgrupada: "valorConIva", estilo: "barras" },
    ],
  },
  {
    clave: "desempenoProveedores",
    nombre: "Desempeño de proveedores",
    descripcion: "Valoración de Nova, compras y proveedores a revisar.",
    periodoGeneral: "mes_anterior",
    contexto: { audiencia: "Compras", tono: "ejecutivo" },
    bloques: [
      RESUMEN("Resume el desempeño de los proveedores del período según las compras: con quiénes se concentró el gasto y qué proveedores conviene revisar. 3 a 4 líneas."),
      { tipo: "proveedoresValoracion", titulo: "Proveedores a revisar", umbral: 3 },
      { tipo: "grafico", titulo: "Gasto por proveedor", agruparPor: "proveedor", metricaAgrupada: "valorConIva", estilo: "barras" },
      { tipo: "tabla", titulo: "Compras por proveedor", agruparPor: "proveedor" },
    ],
  },
  {
    clave: "cumplimientoTiempos",
    nombre: "Cumplimiento de tiempos",
    descripcion: "Compras que superaron los 8 días hábiles y por qué.",
    periodoGeneral: "mes_anterior",
    contexto: { audiencia: "Compras", tono: "ejecutivo" },
    bloques: [
      RESUMEN("Explica cómo estuvieron los tiempos de entrega del período frente al plazo de 8 días hábiles: el porcentaje de cumplimiento, cómo cambió frente al período anterior y qué áreas o proveedores concentran los retrasos. 3 a 5 líneas."),
      { tipo: "kpi", titulo: "Cumplimiento de tiempos", metrica: "cumplimientoPct" },
      { tipo: "kpi", titulo: "Promedio de días hábiles", metrica: "promedioDiasHabiles" },
      { tipo: "kpi", titulo: "Pendientes vencidas", metrica: "totalPendientesVencidos" },
      { tipo: "fueraPlazo", titulo: "Compras fuera de plazo" },
      { tipo: "pendientes", titulo: "Solicitudes sin entregar" },
    ],
  },
  {
    clave: "cicloProveedores",
    nombre: "Ciclo de proveedores",
    descripcion: "Actualizados, pendientes y días al corte del ciclo.",
    periodoGeneral: "anio_actual",
    contexto: { audiencia: "Proveedores", tono: "ejecutivo" },
    bloques: [
      { tipo: "cicloProveedores", titulo: "Estado del ciclo de actualización" },
      { tipo: "proveedoresValoracion", titulo: "Proveedores con baja valoración", umbral: 3 },
    ],
  },
];

// ---------- Esquemas ----------

const BLOQUE_SCHEMA = {
  type: "OBJECT",
  properties: {
    tipo: { type: "STRING" },
    titulo: { type: "STRING" },
    metrica: { type: "STRING", nullable: true },
    agruparPor: { type: "STRING", nullable: true },
    metricaAgrupada: { type: "STRING", nullable: true },
    orden: { type: "STRING", nullable: true },
    estilo: { type: "STRING", nullable: true },
    serie: { type: "STRING", nullable: true },
    promedio: { type: "BOOLEAN", nullable: true },
    ultimosDias: { type: "NUMBER", nullable: true },
    contenido: { type: "STRING", nullable: true },
    pregunta: { type: "STRING", nullable: true },
    umbral: { type: "NUMBER", nullable: true },
    limite: { type: "NUMBER", nullable: true },
    comparar: { type: "BOOLEAN", nullable: true },
  },
  required: ["tipo", "titulo"],
};

// dashboard: false omite la guía de gráficas del Dashboard (larga) cuando el pedido no tiene que ver con ellas.
// Los períodos y las fechas NO se piden en el diseño: se eligen en Programación, en la pregunta "¿Qué período cubre
// cada envío?" (ProgramacionWizard.jsx). Un informe programado se repite cada mes, así que un rango fijo quedaría viejo.
const AVISO_PERIODO = 'El período y las fechas no se piden aquí: se eligen en Programación, en la pregunta "¿Qué período cubre cada envío?" (el mes anterior, lo que va del mes, la semana anterior, lo que va del año, el año anterior o todo el histórico), y se aplican a todo el informe en cada envío.';
const AVISO_PERIODO_CORTO = 'Período: se elige en Programación ("¿Qué período cubre cada envío?")';
const REGLA_PERIODO = `PERÍODOS Y FECHAS: NO puedes fijar períodos ni fechas concretas en el diseño (un mes, trimestre o año, "últimos N días", fechas o rangos). El período de cada envío se configura en «Programación», en la pregunta «¿Qué período cubre cada envío?» (El mes anterior completo, Lo que va del mes, La semana anterior, Lo que va del año, El año anterior completo o Todo el histórico) y vale para todo el informe. Si el usuario pide un período o fechas, NO los apliques ni uses "ultimosDias": diseña el informe igual y explícale que eso se elige en Programación → «¿Qué período cubre cada envío?».`;
const MESES_TXT = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const RE_PERIODO = new RegExp(
  "\\b(" + MESES_TXT + ")\\b|\\b(trimestre|semestre|bimestre|quincena)\\b|\\b20\\d{2}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}/\\d{1,2}(/\\d{2,4})?\\b|\\b[uú]ltim[oa]s?\\s+(\\d+\\s+)?(d[ií]as?|semanas?|meses|mes|a[nñ]os?)\\b|\\b(este|esta|el|la)\\s+(mes|semana|a[nñ]o)\\s*(pasad[oa]|anterior|actual|en curso)?\\b|\\b(mes|semana|a[nñ]o)\\s+(pasad[oa]|anterior|actual|en curso)\\b|\\b(hoy|ayer)\\b|\\b(desde|hasta)\\s+(el\\s+)?\\d|\\bfechas?\\b|\\bper[ií]odos?\\b|\\brango\\b",
  "i"
);
// ¿El mensaje del usuario pide un período o fechas? Se detecta aquí (no solo en el modelo) para avisarle siempre.
const mencionaPeriodo = (texto) => RE_PERIODO.test(String(texto || ""));

const CATALOGO_TEXTO = ({ dashboard = true } = {}) => `Tipos de bloque (usa EXACTAMENTE estos valores en "tipo"):
- "ia": párrafo que Nova redacta al generar el informe con los datos EXACTOS del período (resumen ejecutivo, conclusiones, explicación de una caída). Pon en "pregunta" qué debe escribir (instrucción concreta, 1-3 frases). Es la forma correcta de cualquier texto que mencione cifras.
- "texto": texto fijo escrito tal cual en "contenido" (solo notas sin cifras).
- "kpi": una cifra clave. "metrica" es EXACTAMENTE una de: ${Object.entries(CATALOGO_BLOQUES.metricasKpi).map(([k, v]) => `${k} (${v})`).join(", ")}. Se compara sola con el período anterior.
- "grafico": una gráfica. "agruparPor" es el eje X o la categoría, EXACTAMENTE una de: ${Object.keys(CATALOGO_BLOQUES.agruparPor).join(", ")} ("mes" y "dia" son en el tiempo, en orden cronológico). "metricaAgrupada": "valorConIva" (valor comprado) o "cantidad" (número de compras) — es el eje Y. "estilo": "barras" (barras horizontales, ranking por categoría), "columnas" (columnas verticales, ideal para mes o día), "linea" (línea en el tiempo, para mes o día), "dona" (participación de pocas categorías) o "apiladas" (columnas apiladas en el tiempo). Para "apiladas" usa agruparPor "mes" o "dia" y "serie" con el campo que divide cada columna (area, categoria, proveedor, estado, estadoLegalizacion, responsable o medioPago); ej. "valor por área y mes" → agruparPor "mes", serie "area", estilo "apiladas". "promedio": true muestra una línea punteada con el promedio (por defecto sí en columnas y línea).
  "metricaAgrupada" también puede ser "valoracionProveedor" o "valoracionCompra": entonces la gráfica NO suma valor ni cuenta compras, muestra el PROMEDIO de la valoración de Nova (1 a 5) de las compras valoradas del período, agrupado por "agruparPor" (casi siempre "proveedor"; no sirve con "mes" ni "dia"). Úsala para pedidos como "top 5 proveedores con menor valoración" o "con mejor valoración". "orden": "menor" ordena del menor al mayor valoración (los peor valorados primero; es el valor por defecto) y "mayor" del mayor al menor. "limite": cuántos mostrar (por defecto 5). Estilo siempre "barras".
  "ultimosDias": NO lo uses ni lo cambies (solo existe en secciones que ya lo traían): los períodos NO se piden en el diseño, se eligen en Programación (ver PERÍODOS Y FECHAS).
  "agruparPor": "compra" hace que CADA barra sea una compra individual (etiqueta "#número descripción"), para tops de compras: "las 5 compras de mayor valor" (metricaAgrupada "valorConIva", orden "mayor") o "las 5 compras peor valoradas" (metricaAgrupada "valoracionCompra", orden "menor"). Con "valoracionProveedor" cada barra es la valoración que recibió el proveedor en esa compra.
  "orden": "mayor" (de mayor a menor, por defecto) o "menor" (de menor a mayor) ordena CUALQUIER ranking de una gráfica por la métrica elegida (valor, cantidad o valoración).
  Ejemplos: "top 5 proveedores con menor valoración" → agruparPor "proveedor", metricaAgrupada "valoracionProveedor", orden "menor", limite 5, estilo "barras". "los 3 proveedores mejor valorados" → igual con orden "mayor", limite 3. "top 5 compras de mayor valor" → agruparPor "compra", metricaAgrupada "valorConIva", orden "mayor", limite 5, estilo "barras". "las 5 compras peor valoradas" → agruparPor "compra", metricaAgrupada "valoracionCompra", orden "menor", limite 5, estilo "barras". "compras por día" → agruparPor "dia", estilo "columnas". "compras por día, cantidad en el eje Y" → agruparPor "dia", metricaAgrupada "cantidad", estilo "columnas". "valor por mes en línea" → agruparPor "mes", estilo "linea". "participación por categoría" → agruparPor "categoria", estilo "dona".
- "tabla": desglose por "agruparPor" (mismos valores que grafico).
- "presupuesto": presupuesto vs. gastado por área (año en curso).
- "pendientes": solicitudes sin entregar del período.
- "fueraPlazo": compras que superaron los 8 días hábiles.
- "proveedoresValoracion": proveedores con peor valoración de Nova en el período ("umbral" 1-5, por defecto 3).
- "cicloProveedores": estado del ciclo anual de actualización de proveedores.
- "cumplimientoEntregas": dona de compras entregadas a tiempo vs. tarde (como "Cumplimiento de entregas" del Dashboard).
- "ahorroArea": ahorro (cotizado − comprado) por área, con tabla (como "Ahorro por área" del Dashboard).
- "consumoCategoriaArea": por área, valor del período, acumulado del año, presupuesto, disponible y % consumido (como "Consumo por categoría y área").
- "detalleCompras": el listado de TODAS las compras del período, una por fila (#, fecha, descripción, proveedor, área, estado y valor con IVA), con el total. Úsalo cuando pidan el detalle, "detallado", "cada compra", "listado", "relación de compras" o "todas las compras"; va al final del informe, después de los totales y gráficas.
- En "grafico", "limite": N muestra solo los N primeros (ej. top 5 proveedores).
Períodos válidos para "periodoGeneral": ${PERIODOS.join(", ")} (mes_anterior = el mes calendario anterior a la fecha de cada envío). NO los decides tú: ver PERÍODOS Y FECHAS.

${REGLA_PERIODO}
${dashboard ? `\n${GRAFICAS_DASHBOARD}` : ""}`;

// Versión mínima del catálogo para pedidos que solo tocan el texto de una sección de Nova o una nota ("más corto",
// "más formal", "explica la caída"): no hace falta mandarle a Nova todas las gráficas y cifras.
const CATALOGO_SOLO_TEXTO = `Tipos de bloque de texto:
- "ia": párrafo que Nova redacta al generar el informe con los datos EXACTOS del período. Su "pregunta" es la instrucción de qué escribir (1-3 frases); para cambiar cómo se redacta, cambia la "pregunta".
- "texto": texto fijo escrito tal cual en "contenido" (solo notas sin cifras).`;

// ¿El pedido habla de gráficas, cifras o vistas del Dashboard? Entonces sí va el catálogo completo.
const PIDE_ESTRUCTURA = /dashboard|tablero|gr[aá]fic|cifra|kpi|indicador|tabla|top|agreg|añad|anad|nuev|pon|quit|elimin|borr|mueve|mover|sub|baj|orden|dona|torta|barra|column|l[ií]nea|apilad|promedio|d[ií]as|mes|semana|a[nñ]o|per[ií]odo|[aá]rea|categor|proveedor|presupuest|pendient|plazo|ahorro|cumplim|consumo|valor|cantidad|estado|responsable|medio de pago|ciclo|valoraci/i;
const PIDE_DASHBOARD = /dashboard|tablero|como en el panel|participaci|top ?5|ahorro|cumplimiento|consumo|medio de pago|valor cotizado|ticket/i;

// Lo que muestra el Dashboard de compras y cómo se arma cada vista como bloque del informe. Así, cuando el usuario
// pide "la gráfica de valor de compras por mes del dashboard", Nova sabe exactamente qué bloque crear (mismo título).
const GRAFICAS_DASHBOARD = `GRÁFICAS Y CIFRAS DEL DASHBOARD DE COMPRAS (si el usuario nombra una, o dice "como en el dashboard", crea EXACTAMENTE este bloque con ese título):
- Cifras de arriba del Dashboard: "Valor del mes" → kpi totalValorConIva; "Cumplimiento de tiempos" → kpi cumplimientoPct; "En proceso" / "Pendientes en riesgo" → kpi totalPendientesVencidos; "Ticket promedio" → kpi ticketPromedio; "Total compras" → kpi totalRegistros; "Ahorro total" → kpi ahorroTotal; "% ahorro global" → kpi pctAhorro.
- "Valor de compras por mes" → grafico agruparPor "mes", metricaAgrupada "valorConIva", estilo "columnas" (con línea de promedio). Para que muestre varios meses, el usuario debe elegir en Programación un período largo (p. ej. "Lo que va del año"); con "El mes anterior completo" solo saldría un mes.
- "Valor de compras por área y mes" → grafico agruparPor "mes", serie "area", metricaAgrupada "valorConIva", estilo "apiladas" (top 5 áreas + Otras). Igual que la anterior, el usuario debe elegir en Programación un período de varios meses.
- "Participación por área" → grafico agruparPor "area", metricaAgrupada "valorConIva", estilo "dona".
- "Participación por categoría" → grafico agruparPor "categoria", metricaAgrupada "valorConIva", estilo "dona".
- "Compras por área" → grafico agruparPor "area", metricaAgrupada "valorConIva", estilo "barras".
- "Consumo por categoría y área" → tabla agruparPor "categoria" (el detalle por área se explica con un bloque "ia" si lo piden).
- "Estado de la compra" → grafico agruparPor "estado", metricaAgrupada "cantidad", estilo "dona".
- "Medio de pago" → grafico agruparPor "medioPago", metricaAgrupada "valorConIva", estilo "dona".
- "Compras por responsable" → grafico agruparPor "responsable", metricaAgrupada "cantidad", estilo "barras".
- "Top 5 proveedores por volumen de compra" → grafico agruparPor "proveedor", metricaAgrupada "valorConIva", estilo "barras".
- "Top 5 proveedores con menor valoración" → grafico agruparPor "proveedor", metricaAgrupada "valoracionProveedor", orden "menor", limite 5, estilo "barras" (con "mayor" en orden: los mejor valorados).
- "Cumplimiento de entregas" / "Tiempos de solicitud a entrega" → kpis cumplimientoPct y promedioDiasHabiles + bloque "fueraPlazo".
- "Cumplimiento por mes" → no hay un bloque idéntico (cumplido vs no cumplido por mes): ofrece kpi cumplimientoPct + bloque "fueraPlazo" y dilo en la respuesta.
- "Solicitudes pendientes" → bloque "pendientes".
- "Presupuesto vs. gastado — nivel general" → bloque "presupuesto".
- "Ahorro por área" → bloque "ahorroArea".
- "Cumplimiento de entregas" (la dona) → bloque "cumplimientoEntregas". "Consumo por categoría y área" → bloque "consumoCategoriaArea".
- Cifras: "Valor cotizado" → kpi valorCotizado; "Valor compra (cotizados)" → kpi valorCompraCotizados; "En proceso" → kpi enProceso; "Presupuestado/Gastado/% consumido/Disponible" → kpis presupuestado, gastadoAnio, pctConsumido, disponible.
- "Top 5 proveedores…" → grafico agruparPor "proveedor", estilo "barras", limite 5.
- "Todo el dashboard mensual" → existe la plantilla "Dashboard mensual"; recomiéndala.
- "Resumen ejecutivo" → bloque "ia" con una pregunta de resumen del período.`;

const INFORME_SCHEMA = {
  type: "OBJECT",
  properties: {
    nombre: { type: "STRING" },
    periodoGeneral: { type: "STRING" },
    audiencia: { type: "STRING", nullable: true },
    tono: { type: "STRING", nullable: true },
    entendido: { type: "ARRAY", items: { type: "STRING" } },
    bloques: { type: "ARRAY", items: BLOQUE_SCHEMA },
    filtroAreas: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
    filtroCategorias: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
  },
  required: ["nombre", "periodoGeneral", "bloques", "entendido"],
};

// ALCANCE (filtro por área y categoría): Nova propone nombres; aquí se resuelven contra los nombres reales (sin tildes
// ni mayúsculas, y si no hay uno igual, el que contenga todas las palabras). Lo que no exista se descarta con aviso.
const REGLA_ALCANCE = `ALCANCE: si el pedido se limita a una o varias categorías o áreas (p. ej. "lo consumido en imprevistos administrativos", "solo el área de Mercadeo"), pon esos nombres en "filtroCategorias" / "filtroAreas", copiándolos de las listas de categorías y áreas que existen. Todo el informe (cifras, gráficas, tablas y secciones de Nova) se calcula entonces solo con esas compras. Si el pedido no limita, déjalos vacíos. Un desglose ("por categoría", "por área") NO es un filtro: es un bloque con agruparPor.`;
const nAlc = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function resolverNombres(pedidos, existentes) {
  const mapa = new Map((existentes || []).map((v) => [nAlc(v), v]));
  const ok = [];
  const faltan = [];
  for (const p of pedidos || []) {
    const n = nAlc(p);
    if (!n) continue;
    if (mapa.has(n)) { ok.push(mapa.get(n)); continue; }
    const palabras = n.split(" ").filter((w) => w.length > 2);
    const hits = [...mapa.keys()].filter((k) => palabras.length && palabras.every((w) => k.includes(w)));
    if (hits.length) ok.push(...hits.map((k) => mapa.get(k))); else faltan.push(p);
  }
  return { ok: [...new Set(ok)], faltan };
}
function alcanceDe(res, aggregates) {
  const a = resolverNombres(res.filtroAreas, Object.keys(aggregates.porArea || {}));
  const c = resolverNombres(res.filtroCategorias, Object.keys(aggregates.porCategoria || {}));
  const filtros = a.ok.length || c.ok.length ? { areas: a.ok, categorias: c.ok } : null;
  const avisos = [...a.faltan.map((x) => `No existe el área «${x}»; no se filtró por ella.`), ...c.faltan.map((x) => `No existe la categoría «${x}»; no se filtró por ella.`)];
  return { filtros, avisos };
}

const ESTILOS = ["barras", "columnas", "linea", "dona", "apiladas"];
const CRONOLOGICOS = ["mes", "dia"];

// Deja solo valores que el sistema sabe calcular. Si Nova propuso algo que no existe, NO se reemplaza en silencio por
// otra cosa (antes caía en "por área"): se conserva lo anterior de ese bloque y se devuelve un aviso para contárselo
// al usuario.
function limpiarBloques(bloques, previos = []) {
  const avisos = [];
  const lista = (bloques || [])
    .filter((b) => b && TIPOS.includes(b.tipo))
    .map((b, i) => {
      const prev = previos[i] && previos[i].tipo === b.tipo ? previos[i] : null;
      const out = { tipo: b.tipo, titulo: String(b.titulo || "").slice(0, 120) };
      for (const k of ["metrica", "agruparPor", "metricaAgrupada", "orden", "estilo", "contenido", "pregunta", "serie"]) if (b[k]) out[k] = String(b[k]);
      if (b.umbral != null) out.umbral = Number(b.umbral);
      if (b.comparar === false) out.comparar = false;
      if (b.promedio === false) out.promedio = false;
      if (b.ultimosDias != null && Number(b.ultimosDias) >= 1) out.ultimosDias = Math.min(120, Math.round(Number(b.ultimosDias)));
      if (b.limite != null && Number(b.limite) >= 1) out.limite = Math.min(15, Math.round(Number(b.limite)));
      if (out.tipo === "kpi" && !CATALOGO_BLOQUES.metricasKpi[out.metrica]) {
        avisos.push(`La cifra "${out.metrica}" no existe; dejé ${prev?.metrica ? "la que tenía" : "el valor total comprado"}.`);
        out.metrica = prev?.metrica || "totalValorConIva";
      }
      if (out.tipo === "grafico" || out.tipo === "tabla") {
        if (!CATALOGO_BLOQUES.agruparPor[out.agruparPor]) {
          avisos.push(`No puedo agrupar por "${out.agruparPor || "(vacío)"}"; se puede por ${Object.values(CATALOGO_BLOQUES.agruparPor).join(", ")}.`);
          out.agruparPor = prev?.agruparPor || "area";
        }
        if (out.serie && (!CATALOGO_BLOQUES.agruparPor[out.serie] || CRONOLOGICOS.includes(out.serie))) {
          avisos.push(`No puedo dividir las columnas por "${out.serie}".`);
          delete out.serie;
        }
      }
      if (out.tipo === "grafico") {
        if (out.metricaAgrupada && !CATALOGO_BLOQUES.metricasGrafico[out.metricaAgrupada]) {
          avisos.push(`No puedo graficar "${out.metricaAgrupada}"; se puede ${Object.keys(CATALOGO_BLOQUES.metricasGrafico).join(", ")}.`);
          out.metricaAgrupada = prev?.metricaAgrupada || "valorConIva";
        }
        if (["valoracionProveedor", "valoracionCompra"].includes(out.metricaAgrupada)) {
          if (CRONOLOGICOS.includes(out.agruparPor)) {
            avisos.push("La valoración se grafica por proveedor, área, categoría… no por mes o día; la dejé por proveedor.");
            out.agruparPor = "proveedor";
          }
          out.estilo = "barras";
          delete out.serie;
          if (out.orden !== "mayor") out.orden = "menor";
        } else if (out.orden !== "menor" && out.orden !== "mayor") {
          delete out.orden;
        }
        if (out.estilo && !ESTILOS.includes(out.estilo)) {
          avisos.push(`El tipo de gráfica "${out.estilo}" no existe; se puede barras, columnas, línea, dona o apiladas.`);
          out.estilo = prev?.estilo || (CRONOLOGICOS.includes(out.agruparPor) ? "columnas" : "barras");
        }
        if (!out.estilo) out.estilo = CRONOLOGICOS.includes(out.agruparPor) ? "columnas" : "barras";
        if (out.estilo === "apiladas" && (!out.serie || !CRONOLOGICOS.includes(out.agruparPor))) {
          avisos.push("Las columnas apiladas necesitan el tiempo (mes o día) en el eje X y un campo para dividir cada columna.");
          out.estilo = "columnas";
        }
        if (out.estilo !== "apiladas") delete out.serie;
      }
      return out;
    })
    .slice(0, 14);
  return { bloques: lista, avisos };
}

// ---------- Armar desde el pedido ----------

export async function armarDesdePedido(pedido) {
  const { aggregates } = await loadAggregates();
  const resumenDatos = {
    totalRegistros: aggregates.totalRegistros,
    areas: Object.keys(aggregates.porArea || {}),
    categorias: Object.keys(aggregates.porCategoria || {}),
    tieneValoraciones: true,
    tienePresupuesto: Object.keys(aggregates.presupuesto || {}).length > 0,
  };
  const res = await generateStructuredJson({
    systemInstruction: `Eres Nova, el asistente del Estudio de informes del Panel de Compras y Bienestar de Sinco. Un usuario describe con sus palabras el informe que necesita y tú armas su ESTRUCTURA: nombre, período, para quién es, tono y la lista ordenada de bloques. Nunca escribes cifras: las cifras las calcula el sistema con los datos reales.

${CATALOGO_TEXTO()}

Cómo armarlo:
- Empieza casi siempre con un bloque "ia" titulado "Resumen ejecutivo" cuya pregunta pida un resumen para la audiencia indicada.
- Agrupa 2 a 4 bloques "kpi" seguidos con las cifras más relevantes para el pedido (se muestran en una fila).
- Agrega solo los bloques que el pedido justifica (entre 4 y 10 en total). Si pide "qué se pasó de los 8 días", usa "fueraPlazo"; si pide proveedores mal valorados, "proveedoresValoracion"; si pide presupuesto, "presupuesto".
- "nombre": corto y claro (ej. "Informe mensual de compras · Gerencia").
- "periodoGeneral": SIEMPRE "mes_anterior" (valor inicial); el usuario lo cambia después en Programación. Aunque el pedido mencione un mes, año, trimestre, fechas o "últimos N días", no lo apliques ni lo pongas como chip en "entendido": armas el informe igual (ver PERÍODOS Y FECHAS).
- "audiencia": para quién es (Gerencia, Comité, Compras, Proveedores…) o null.
- "tono": "ejecutivo", "detallado" o "formal".
- "entendido": 3 a 5 frases cortas de lo que entendiste, para mostrárselas al usuario como chips (ej. "Para: Gerencia", "Incluye compras fuera de plazo"; nunca de período).

${REGLA_ALCANCE}`,
    prompt: `Pedido del usuario:\n"""${String(pedido || "").slice(0, 2000)}"""\n\nDatos disponibles (solo para saber qué existe, no para citar):\n${JSON.stringify(resumenDatos)}`,
    schema: INFORME_SCHEMA,
    budgetMs: 45000,
  });
  const { filtros, avisos: avisosAlcance } = alcanceDe(res, aggregates);
  const chipAlcance = filtros ? [`Solo: ${[...filtros.categorias, ...filtros.areas].join(", ")}`] : [];
  return {
    nombre: String(res.nombre || "Nuevo informe").slice(0, 120),
    periodoGeneral: "mes_anterior", // el período real se elige en Programación
    contexto: { audiencia: res.audiencia || null, tono: res.tono || "ejecutivo", excluirAnulados: true, ...(filtros ? { filtros } : {}) },
    entendido: [...(mencionaPeriodo(pedido) ? [AVISO_PERIODO_CORTO] : []), ...chipAlcance, ...avisosAlcance, ...(res.entendido || []).filter((t) => !/per[ií]odo|trimestre|[uú]ltimos|fechas?/i.test(t) && !(chipAlcance.length && /filtr|solo |alcance|^categor[ií]as?s*:|^[aá]reas?s*:/i.test(t)))].slice(0, 6), // un solo chip de período, el nuestro
    bloques: limpiarBloques(res.bloques).bloques,
  };
}

// ---------- Editar conversando ----------

// Nova no devuelve el informe completo (lento: muchos tokens de salida y riesgo de alterar secciones que no se
// pidieron) sino solo las OPERACIONES a aplicar, en orden. Los índices se refieren a la lista tal como va quedando.
const CAMBIO_SCHEMA = { ...BLOQUE_SCHEMA, required: [] };
const EDICION_SCHEMA = {
  type: "OBJECT",
  properties: {
    respuesta: { type: "STRING" },
    nombre: { type: "STRING", nullable: true },
    periodoGeneral: { type: "STRING", nullable: true },
    cambiarAlcance: { type: "BOOLEAN", nullable: true },
    filtroAreas: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
    filtroCategorias: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
    operaciones: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          op: { type: "STRING" }, // "cambiar" | "agregar" | "quitar" | "mover"
          indice: { type: "NUMBER", nullable: true }, // cambiar / quitar / mover: sección afectada
          posicion: { type: "NUMBER", nullable: true }, // agregar / mover: posición final (null = al final)
          bloque: CAMBIO_SCHEMA, // agregar: el bloque completo; cambiar: SOLO los campos que cambian
        },
        required: ["op"],
      },
    },
  },
  required: ["respuesta", "operaciones"],
};

function aplicarOperaciones(bloques, operaciones) {
  const lista = (bloques || []).map((b) => ({ ...b }));
  const valido = (i) => Number.isInteger(i) && i >= 0 && i < lista.length;
  for (const o of operaciones || []) {
    const i = o.indice != null ? Math.round(Number(o.indice)) : null;
    const pos = o.posicion != null ? Math.max(0, Math.min(lista.length, Math.round(Number(o.posicion)))) : lista.length;
    const campos = Object.fromEntries(Object.entries(o.bloque || {}).filter(([, v]) => v !== null && v !== undefined));
    if (o.op === "cambiar" && valido(i)) lista[i] = { ...lista[i], ...campos };
    else if (o.op === "agregar" && campos.tipo) lista.splice(pos, 0, { titulo: TIPOS_ETIQUETA[campos.tipo] || "Sección", ...campos });
    else if (o.op === "quitar" && valido(i)) lista.splice(i, 1);
    else if (o.op === "mover" && valido(i)) { const [b] = lista.splice(i, 1); lista.splice(Math.min(pos, lista.length), 0, b); }
  }
  return lista;
}

const TIPOS_ETIQUETA = { ia: "Análisis de Nova", texto: "Nota", kpi: "Cifra clave", grafico: "Gráfica", tabla: "Tabla", presupuesto: "Presupuesto", pendientes: "Solicitudes sin entregar", fueraPlazo: "Compras fuera de plazo", proveedoresValoracion: "Proveedores a revisar", cicloProveedores: "Ciclo de proveedores", detalleCompras: "Detalle de compras" };

export async function editarConNova({ nombre, periodoGeneral, contexto, bloques, seleccion, instruccion, historial }) {
  const sel = Number.isInteger(seleccion) && bloques?.[seleccion] ? seleccion : null;
  // Menos texto a la IA en cada pedido: catálogo mínimo si solo se retoca el texto de la sección seleccionada, guía del
  // Dashboard solo si el pedido la menciona, y el informe sin los textos ya redactados (textoGuardado), que no hacen
  // falta para decidir los cambios.
  const pedido = String(instruccion || "");
  const conversacion = `${pedido} ${(historial || []).slice(-2).map((m) => m.texto).join(" ")}`;
  const soloTexto = sel != null && ["ia", "texto"].includes(bloques[sel].tipo) && !PIDE_ESTRUCTURA.test(pedido);
  const catalogo = soloTexto ? CATALOGO_SOLO_TEXTO : CATALOGO_TEXTO({ dashboard: PIDE_DASHBOARD.test(conversacion) });
  const compactos = (bloques || []).map((b, i) => {
    const { textoGuardado, destacadoGuardado, ...resto } = b; // eslint-disable-line no-unused-vars
    return { i, ...resto };
  });
  const { aggregates: agg } = await loadAggregates();
  const res = await generateStructuredJson({
    systemInstruction: `Eres Nova dentro del editor del Estudio de informes. El usuario te pide cambios sobre un informe y tú devuelves SOLO las operaciones a aplicar (no el informe completo), en orden, y una respuesta corta en español (1-2 frases) contando qué hiciste.
Operaciones ("op"): "cambiar" (indice + bloque con SOLO los campos que cambian; para quitar un límite de días usa ultimosDias 0), "agregar" (bloque completo con tipo y titulo; posicion opcional, por defecto al final), "quitar" (indice), "mover" (indice + posicion). Los índices se refieren a la lista tal como va quedando después de cada operación. Si no hay nada que cambiar, devuelve operaciones vacías y explícalo.

${catalogo}

Reglas:
- Si hay una sección seleccionada, el pedido se refiere a ESA sección salvo que diga lo contrario. No toques las demás.
- "Más corto", "más formal", "explica la caída": ajusta la "pregunta" de los bloques "ia" (son las instrucciones con que Nova redacta).
- "Cambia a torta/dona": "estilo": "dona". "Compáralo con el período anterior": las cifras kpi ya se comparan solas; si piden otra comparación que el sistema no puede calcular, dilo en "respuesta" y propone lo más cercano.
- "Agrega el top 5 de proveedores": un bloque "tabla" o "grafico" con agruparPor "proveedor".
- Puedes cambiar "nombre" solo si lo piden. "periodoGeneral" devuélvelo SIEMPRE en null: no puedes cambiar períodos ni fechas (ver PERÍODOS Y FECHAS); si lo piden, explícalo en "respuesta".
- Haz EXACTAMENTE lo que piden: no cambies "agruparPor" a "area" ni a otro valor que no pidieron. Si piden algo que no está en el catálogo (otra agrupación, otra cifra), no lo cambies por algo parecido sin decirlo: explica en "respuesta" qué no se puede y qué propones en su lugar.
- Nunca inventes cifras ni nombres de proveedores o áreas.
- ${REGLA_ALCANCE} Solo si el pedido cambia el alcance (limitar, ampliar o quitar el filtro), pon "cambiarAlcance": true con la lista COMPLETA que debe quedar (vacía para quitarlo); si no, "cambiarAlcance": false.`,
    prompt: `Informe actual:
${JSON.stringify({ nombre, periodoGeneral, audiencia: contexto?.audiencia || null, tono: contexto?.tono || null, alcance: contexto?.filtros || null, bloques: compactos })}
Áreas que existen: ${JSON.stringify(Object.keys(agg.porArea || {}))}
Categorías que existen: ${JSON.stringify(Object.keys(agg.porCategoria || {}))}
(Índices actuales: 0 a ${Math.max(0, (bloques || []).length - 1)}.)

${sel != null ? `Sección seleccionada: índice ${sel} ("${bloques[sel].titulo}").` : "No hay sección seleccionada."}
${historial?.length ? `Conversación previa:\n${historial.slice(-4).map((m) => `${m.rol}: ${String(m.texto || "").slice(0, 300)}`).join("\n")}\n` : ""}
Pedido del usuario: """${String(instruccion || "").slice(0, 1500)}"""`,
    schema: EDICION_SCHEMA,
    budgetMs: 45000,
  });
  const resultado = aplicarOperaciones(bloques, res.operaciones);
  const { bloques: limpios, avisos } = limpiarBloques(resultado, resultado.map((b, i) => bloques?.[i] || null));
  let alcance;
  if (res.cambiarAlcance) {
    const r = alcanceDe(res, agg);
    alcance = { filtros: r.filtros };
    avisos.push(...r.avisos);
  }
  return {
    ...(alcance ? { filtros: alcance.filtros } : {}),
    respuesta: [res.respuesta || "Listo.", ...avisos.map((a) => `Ojo: ${a}`), ...(mencionaPeriodo(instruccion) && !/programaci[oó]n/i.test(res.respuesta || "") ? [AVISO_PERIODO] : [])].join("\n"),
    nombre: res.nombre ? String(res.nombre).slice(0, 120) : null,
    periodoGeneral: null, // los períodos se eligen en Programación, no desde el chat
    bloques: limpios,
  };
}

// ---------- Programación en lenguaje natural ----------

const PROGRAMACION_SCHEMA = {
  type: "OBJECT",
  properties: {
    entendible: { type: "BOOLEAN" },
    frecuencia: { type: "STRING", nullable: true },
    diaSemana: { type: "NUMBER", nullable: true },
    diaMes: { type: "NUMBER", nullable: true },
    ordinal: { type: "NUMBER", nullable: true },
    fechaUnica: { type: "STRING", nullable: true },
    hora: { type: "STRING", nullable: true },
    aclaracion: { type: "STRING", nullable: true },
  },
  required: ["entendible"],
};

export async function interpretarProgramacion(texto) {
  const hoy = new Date();
  const res = await generateStructuredJson({
    systemInstruction: `Conviertes una frase en español sobre cuándo enviar un informe en una regla de programación. Hoy es ${hoy.toISOString().slice(0, 10)} (zona horaria de Colombia).
Frecuencias (usa EXACTAMENTE): ${FRECUENCIAS.join(", ")}.
- diaria: cada día hábil.
- semanal: "diaSemana" 0=domingo, 1=lunes … 6=sábado.
- mensual: "diaMes" 1-31 (31 = fin de mes).
- mensual_semana: el "ordinal" (1, 2, 3, 4 o -1 = último) "diaSemana" hábil del mes. "El primer lunes hábil" → ordinal 1, diaSemana 1.
- ultimo_habil: último día hábil del mes.
- unica: solo una vez, "fechaUnica" YYYY-MM-DD (si no dice el año, el próximo que corresponda).
"hora" en 24 h "HH:mm" (si no la dice, "08:00"; "en la mañana" → "08:00", "en la tarde" → "14:00").
Si no se puede entender, "entendible": false y en "aclaracion" pide lo que falta en una frase.`,
    prompt: `Frase: """${String(texto || "").slice(0, 300)}"""`,
    schema: PROGRAMACION_SCHEMA,
    budgetMs: 25000,
  });
  if (!res.entendible || !FRECUENCIAS.includes(res.frecuencia)) {
    return { entendible: false, aclaracion: res.aclaracion || "No entendí cuándo enviarlo. Prueba con algo como \"cada viernes a las 7:30\"." };
  }
  const regla = {
    frecuencia: res.frecuencia,
    diaSemana: res.diaSemana != null ? Number(res.diaSemana) : res.frecuencia === "semanal" || res.frecuencia === "mensual_semana" ? 1 : null,
    diaMes: res.diaMes != null ? Number(res.diaMes) : res.frecuencia === "mensual" ? 1 : null,
    ordinal: res.ordinal != null ? Number(res.ordinal) : res.frecuencia === "mensual_semana" ? 1 : null,
    fechaUnica: res.fechaUnica || null,
    hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(res.hora || "") ? res.hora : "08:00",
    saltarFestivos: true,
  };
  return { entendible: true, regla, descripcion: describirProgramacion(regla), proximas: proximasFechas(regla, 5) };
}

// ---------- Mensaje del correo ----------

export async function redactarMensaje({ nombre, contexto, instruccion }) {
  const res = await generateStructuredJson({
    systemInstruction: `Redactas el asunto y el cuerpo del correo con que se envía un informe de compras en PDF adjunto. Español de Colombia, cordial y profesional, breve (3 a 6 líneas de cuerpo). Usa estas variables tal cual, entre llaves, que el sistema reemplaza al generar cada envío: {nombre} (nombre del informe), {periodo} (ej. "Octubre 2026"), {mes}, {año}, {valor_total}, {fecha_envio} y {resumen_nova} (2-3 frases con las cifras del período, que Nova escribe en cada envío). Incluye {resumen_nova} en el cuerpo. No inventes cifras.`,
    prompt: `Informe: "${nombre || "Informe"}". Para: ${contexto?.audiencia || "sin especificar"}. Tono: ${contexto?.tono || "ejecutivo"}.${instruccion ? ` Indicación del usuario: """${String(instruccion).slice(0, 500)}"""` : ""}`,
    schema: { type: "OBJECT", properties: { asunto: { type: "STRING" }, mensaje: { type: "STRING" } }, required: ["asunto", "mensaje"] },
    budgetMs: 25000,
  });
  return { asunto: String(res.asunto || "").slice(0, 300), mensaje: String(res.mensaje || "").slice(0, 5000) };
}
