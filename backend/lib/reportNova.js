import { generateStructuredJson } from "@/lib/aiStructured";
import { CATALOGO_BLOQUES, loadAggregates } from "@/lib/reportContent";
import { FRECUENCIAS, describirProgramacion, proximasFechas } from "@/lib/reportSchedule";

// Nova dentro del Estudio de informes: arma un informe a partir de un pedido en lenguaje natural, lo edita
// conversando, convierte "el primer lunes hábil de cada mes a las 8" en una regla y redacta el mensaje del correo.
// Regla de oro: Nova decide la ESTRUCTURA y el texto, nunca las cifras. Los bloques kpi/grafico/tabla/fueraPlazo/
// proveedoresValoracion/cicloProveedores se calculan siempre con los datos reales (ver lib/reportContent.js) y los
// bloques "ia" responden sobre los agregados exactos del período del informe.

const TIPOS = ["texto", "kpi", "grafico", "tabla", "ia", "presupuesto", "pendientes", "fueraPlazo", "proveedoresValoracion", "cicloProveedores", "cumplimientoEntregas", "ahorroArea", "consumoCategoriaArea"];
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

const CATALOGO_TEXTO = () => `Tipos de bloque (usa EXACTAMENTE estos valores en "tipo"):
- "ia": párrafo que Nova redacta al generar el informe con los datos EXACTOS del período (resumen ejecutivo, conclusiones, explicación de una caída). Pon en "pregunta" qué debe escribir (instrucción concreta, 1-3 frases). Es la forma correcta de cualquier texto que mencione cifras.
- "texto": texto fijo escrito tal cual en "contenido" (solo notas sin cifras).
- "kpi": una cifra clave. "metrica" es EXACTAMENTE una de: ${Object.entries(CATALOGO_BLOQUES.metricasKpi).map(([k, v]) => `${k} (${v})`).join(", ")}. Se compara sola con el período anterior.
- "grafico": una gráfica. "agruparPor" es el eje X o la categoría, EXACTAMENTE una de: ${Object.keys(CATALOGO_BLOQUES.agruparPor).join(", ")} ("mes" y "dia" son en el tiempo, en orden cronológico). "metricaAgrupada": "valorConIva" (valor comprado) o "cantidad" (número de compras) — es el eje Y. "estilo": "barras" (barras horizontales, ranking por categoría), "columnas" (columnas verticales, ideal para mes o día), "linea" (línea en el tiempo, para mes o día), "dona" (participación de pocas categorías) o "apiladas" (columnas apiladas en el tiempo). Para "apiladas" usa agruparPor "mes" o "dia" y "serie" con el campo que divide cada columna (area, categoria, proveedor, estado, estadoLegalizacion, responsable o medioPago); ej. "valor por área y mes" → agruparPor "mes", serie "area", estilo "apiladas". "promedio": true muestra una línea punteada con el promedio (por defecto sí en columnas y línea).
  "ultimosDias": N limita ESA gráfica o tabla a los últimos N días hasta hoy (ignora el período del informe solo para esa sección; los días sin compras salen en 0). Úsalo cuando pidan "los últimos 5 días", "la última semana" (7), etc.
  Ejemplos: "compras por día de los últimos 5 días" → agruparPor "dia", estilo "columnas", ultimosDias 5. "compras por día, cantidad en el eje Y" → agruparPor "dia", metricaAgrupada "cantidad", estilo "columnas". "valor por mes en línea" → agruparPor "mes", estilo "linea". "participación por categoría" → agruparPor "categoria", estilo "dona".
- "tabla": desglose por "agruparPor" (mismos valores que grafico).
- "presupuesto": presupuesto vs. gastado por área (año en curso).
- "pendientes": solicitudes sin entregar del período.
- "fueraPlazo": compras que superaron los 8 días hábiles.
- "proveedoresValoracion": proveedores con peor valoración de Nova en el período ("umbral" 1-5, por defecto 3).
- "cicloProveedores": estado del ciclo anual de actualización de proveedores.
- "cumplimientoEntregas": dona de compras entregadas a tiempo vs. tarde (como "Cumplimiento de entregas" del Dashboard).
- "ahorroArea": ahorro (cotizado − comprado) por área, con tabla (como "Ahorro por área" del Dashboard).
- "consumoCategoriaArea": por área, valor del período, acumulado del año, presupuesto, disponible y % consumido (como "Consumo por categoría y área").
- En "grafico", "limite": N muestra solo los N primeros (ej. top 5 proveedores).
Períodos válidos para "periodoGeneral": ${PERIODOS.join(", ")} (mes_anterior = el mes calendario anterior a la fecha de cada envío).

${GRAFICAS_DASHBOARD}`;

// Lo que muestra el Dashboard de compras y cómo se arma cada vista como bloque del informe. Así, cuando el usuario
// pide "la gráfica de valor de compras por mes del dashboard", Nova sabe exactamente qué bloque crear (mismo título).
const GRAFICAS_DASHBOARD = `GRÁFICAS Y CIFRAS DEL DASHBOARD DE COMPRAS (si el usuario nombra una, o dice "como en el dashboard", crea EXACTAMENTE este bloque con ese título):
- Cifras de arriba del Dashboard: "Valor del mes" → kpi totalValorConIva; "Cumplimiento de tiempos" → kpi cumplimientoPct; "En proceso" / "Pendientes en riesgo" → kpi totalPendientesVencidos; "Ticket promedio" → kpi ticketPromedio; "Total compras" → kpi totalRegistros; "Ahorro total" → kpi ahorroTotal; "% ahorro global" → kpi pctAhorro.
- "Valor de compras por mes" → grafico agruparPor "mes", metricaAgrupada "valorConIva", estilo "columnas" (con línea de promedio). Para que muestre los meses del año, usa periodoGeneral "anio_actual" o di al usuario que con "mes anterior" solo saldría un mes.
- "Valor de compras por área y mes" → grafico agruparPor "mes", serie "area", metricaAgrupada "valorConIva", estilo "apiladas" (top 5 áreas + Otras). Igual que la anterior, necesita un período de varios meses.
- "Participación por área" → grafico agruparPor "area", metricaAgrupada "valorConIva", estilo "dona".
- "Participación por categoría" → grafico agruparPor "categoria", metricaAgrupada "valorConIva", estilo "dona".
- "Compras por área" → grafico agruparPor "area", metricaAgrupada "valorConIva", estilo "barras".
- "Consumo por categoría y área" → tabla agruparPor "categoria" (el detalle por área se explica con un bloque "ia" si lo piden).
- "Estado de la compra" → grafico agruparPor "estado", metricaAgrupada "cantidad", estilo "dona".
- "Medio de pago" → grafico agruparPor "medioPago", metricaAgrupada "valorConIva", estilo "dona".
- "Compras por responsable" → grafico agruparPor "responsable", metricaAgrupada "cantidad", estilo "barras".
- "Top 5 proveedores por volumen de compra" → grafico agruparPor "proveedor", metricaAgrupada "valorConIva", estilo "barras".
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
  },
  required: ["nombre", "periodoGeneral", "bloques", "entendido"],
};

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
      for (const k of ["metrica", "agruparPor", "metricaAgrupada", "estilo", "contenido", "pregunta", "serie"]) if (b[k]) out[k] = String(b[k]);
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
    tieneValoraciones: true,
    tienePresupuesto: Object.keys(aggregates.presupuesto || {}).length > 0,
  };
  const res = await generateStructuredJson({
    systemInstruction: `Eres Nova, el asistente del Estudio de informes del Panel de Compras de Sinco. Un usuario describe con sus palabras el informe que necesita y tú armas su ESTRUCTURA: nombre, período, para quién es, tono y la lista ordenada de bloques. Nunca escribes cifras: las cifras las calcula el sistema con los datos reales.

${CATALOGO_TEXTO()}

Cómo armarlo:
- Empieza casi siempre con un bloque "ia" titulado "Resumen ejecutivo" cuya pregunta pida un resumen para la audiencia indicada.
- Agrupa 2 a 4 bloques "kpi" seguidos con las cifras más relevantes para el pedido (se muestran en una fila).
- Agrega solo los bloques que el pedido justifica (entre 4 y 10 en total). Si pide "qué se pasó de los 8 días", usa "fueraPlazo"; si pide proveedores mal valorados, "proveedoresValoracion"; si pide presupuesto, "presupuesto".
- "nombre": corto y claro (ej. "Informe mensual de compras · Gerencia").
- "periodoGeneral": deduce del pedido ("mensual" → mes_anterior, "semanal" → semana_anterior, "del año" → anio_actual). Si no lo dice, mes_anterior.
- "audiencia": para quién es (Gerencia, Comité, Compras, Proveedores…) o null.
- "tono": "ejecutivo", "detallado" o "formal".
- "entendido": 3 a 5 frases cortas de lo que entendiste, para mostrárselas al usuario como chips (ej. "Período: mes anterior", "Para: Gerencia", "Incluye compras fuera de plazo").`,
    prompt: `Pedido del usuario:\n"""${String(pedido || "").slice(0, 2000)}"""\n\nDatos disponibles (solo para saber qué existe, no para citar):\n${JSON.stringify(resumenDatos)}`,
    schema: INFORME_SCHEMA,
    budgetMs: 45000,
  });
  return {
    nombre: String(res.nombre || "Nuevo informe").slice(0, 120),
    periodoGeneral: PERIODOS.includes(res.periodoGeneral) ? res.periodoGeneral : "mes_anterior",
    contexto: { audiencia: res.audiencia || null, tono: res.tono || "ejecutivo", excluirAnulados: true },
    entendido: (res.entendido || []).slice(0, 6),
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

const TIPOS_ETIQUETA = { ia: "Análisis de Nova", texto: "Nota", kpi: "Cifra clave", grafico: "Gráfica", tabla: "Tabla", presupuesto: "Presupuesto", pendientes: "Solicitudes sin entregar", fueraPlazo: "Compras fuera de plazo", proveedoresValoracion: "Proveedores a revisar", cicloProveedores: "Ciclo de proveedores" };

export async function editarConNova({ nombre, periodoGeneral, contexto, bloques, seleccion, instruccion, historial }) {
  const sel = Number.isInteger(seleccion) && bloques?.[seleccion] ? seleccion : null;
  const res = await generateStructuredJson({
    systemInstruction: `Eres Nova dentro del editor del Estudio de informes. El usuario te pide cambios sobre un informe y tú devuelves SOLO las operaciones a aplicar (no el informe completo), en orden, y una respuesta corta en español (1-2 frases) contando qué hiciste.
Operaciones ("op"): "cambiar" (indice + bloque con SOLO los campos que cambian; para quitar un límite de días usa ultimosDias 0), "agregar" (bloque completo con tipo y titulo; posicion opcional, por defecto al final), "quitar" (indice), "mover" (indice + posicion). Los índices se refieren a la lista tal como va quedando después de cada operación. Si no hay nada que cambiar, devuelve operaciones vacías y explícalo.

${CATALOGO_TEXTO()}

Reglas:
- Si hay una sección seleccionada, el pedido se refiere a ESA sección salvo que diga lo contrario. No toques las demás.
- "Más corto", "más formal", "explica la caída": ajusta la "pregunta" de los bloques "ia" (son las instrucciones con que Nova redacta).
- "Cambia a torta/dona": "estilo": "dona". "Compáralo con el período anterior": las cifras kpi ya se comparan solas; si piden otra comparación que el sistema no puede calcular, dilo en "respuesta" y propone lo más cercano.
- "Agrega el top 5 de proveedores": un bloque "tabla" o "grafico" con agruparPor "proveedor".
- Puedes cambiar "nombre" o "periodoGeneral" solo si lo piden; si no, devuélvelos en null.
- Haz EXACTAMENTE lo que piden: no cambies "agruparPor" a "area" ni a otro valor que no pidieron. Si piden algo que no está en el catálogo (otra agrupación, otra cifra), no lo cambies por algo parecido sin decirlo: explica en "respuesta" qué no se puede y qué propones en su lugar.
- Nunca inventes cifras ni nombres de proveedores o áreas.`,
    prompt: `Informe actual:
${JSON.stringify({ nombre, periodoGeneral, audiencia: contexto?.audiencia || null, tono: contexto?.tono || null, bloques: (bloques || []).map((b, i) => ({ i, ...b })) })}
(Índices actuales: 0 a ${Math.max(0, (bloques || []).length - 1)}.)

${sel != null ? `Sección seleccionada: índice ${sel} ("${bloques[sel].titulo}").` : "No hay sección seleccionada."}
${historial?.length ? `Conversación previa:\n${historial.slice(-6).map((m) => `${m.rol}: ${m.texto}`).join("\n")}\n` : ""}
Pedido del usuario: """${String(instruccion || "").slice(0, 1500)}"""`,
    schema: EDICION_SCHEMA,
    budgetMs: 45000,
  });
  const resultado = aplicarOperaciones(bloques, res.operaciones);
  const { bloques: limpios, avisos } = limpiarBloques(resultado, resultado.map((b, i) => bloques?.[i] || null));
  return {
    respuesta: [res.respuesta || "Listo.", ...avisos.map((a) => `Ojo: ${a}`)].join("\n"),
    nombre: res.nombre ? String(res.nombre).slice(0, 120) : null,
    periodoGeneral: PERIODOS.includes(res.periodoGeneral) ? res.periodoGeneral : null,
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
