import { generateStructuredJson } from "@/lib/aiStructured";
import { FRECUENCIAS, ymd } from "@/lib/reportSchedule";
import {
  LIMITES, FUENTES, CONSULTAS, PERIODOS, CAMPOS_FECHA, PRESETS_COMPRAS, PRESETS_PROVEEDORES, CONDICIONES, SI_FESTIVO,
  VARIABLES, EVENTOS, AGRUPACIONES, ESTADOS_CICLO, VARIABLES_EVENTO, preguntasFaltantes,
} from "@/lib/notificacionesCatalogo";
import { fuentesPermitidas, mensajeSinPermiso, destinatariosElegibles } from "@/lib/notificacionesPermisos";
import { isRoleAllowed } from "@/lib/permissions";
import { describirCuando, proximasFechas, esSinFiltro } from "@/lib/notificaciones";
import { CANALES } from "@/lib/notificacionesCatalogo";

// Nova convierte el pedido en lenguaje natural en una regla (ver docs/notificaciones-diseno.md §5). Solo interviene
// al crear o editar: la ejecución no usa IA. Nada de lo que devuelve se confía tal cual: el servidor descarta
// consultas de fuentes no permitidas, aplica las respuestas a las preguntas de forma determinista y añade las
// preguntas obligatorias (preguntasFaltantes) que Nova haya olvidado.

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    estado: { type: "STRING" }, // preguntas | lista | no_permitido | es_informe | no_soportado
    mensaje: { type: "STRING", nullable: true },
    explicitos: { type: "ARRAY", items: { type: "STRING" } }, // campos que la persona dijo literalmente en el pedido
    canales: { type: "ARRAY", items: { type: "STRING" }, nullable: true }, // edición: ["app"] | ["app","teams"]
    fuenteNoPermitida: { type: "STRING", nullable: true },
    resumen: { type: "STRING", nullable: true },
    nombre: { type: "STRING", nullable: true },
    consulta: { type: "STRING", nullable: true },
    disparador: { type: "STRING", nullable: true }, // programado | evento
    evento: { type: "STRING", nullable: true },
    agrupacion: { type: "STRING", nullable: true },
    parametros: {
      type: "OBJECT",
      nullable: true,
      properties: {
        preset: { type: "STRING", nullable: true },
        periodo: { type: "STRING", nullable: true },
        dias: { type: "NUMBER", nullable: true },
        campoFecha: { type: "STRING", nullable: true },
        area: { type: "STRING", nullable: true },
        categoria: { type: "STRING", nullable: true },
        estado: { type: "STRING", nullable: true },
        puntajeMax: { type: "NUMBER", nullable: true },
        umbral: { type: "NUMBER", nullable: true },
        estrellasMax: { type: "NUMBER", nullable: true },
        soloFueraDePlazo: { type: "BOOLEAN", nullable: true },
        estadoCiclo: { type: "STRING", nullable: true },
        nivel: { type: "STRING", nullable: true },
        proveedor: { type: "STRING", nullable: true },
        soloExcedido: { type: "BOOLEAN", nullable: true },
      },
    },
    alcance: { type: "STRING", nullable: true },
    condicion: { type: "STRING", nullable: true },
    umbral: { type: "NUMBER", nullable: true },
    frecuencia: { type: "STRING", nullable: true },
    diaSemana: { type: "NUMBER", nullable: true },
    diaMes: { type: "NUMBER", nullable: true },
    ordinal: { type: "NUMBER", nullable: true },
    fechaUnica: { type: "STRING", nullable: true },
    hora: { type: "STRING", nullable: true },
    siFestivo: { type: "STRING", nullable: true },
    titulo: { type: "STRING", nullable: true },
    plantilla: { type: "STRING", nullable: true },
    preguntas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          texto: { type: "STRING" },
          opciones: { type: "ARRAY", items: { type: "OBJECT", properties: { valor: { type: "STRING" }, etiqueta: { type: "STRING" } }, required: ["valor", "etiqueta"] } },
          permiteTexto: { type: "BOOLEAN", nullable: true },
        },
        required: ["id", "texto", "opciones"],
      },
    },
  },
  required: ["estado", "preguntas"],
};

function catalogoTexto(permitidas) {
  const lineas = [];
  for (const [clave, c] of Object.entries(CONSULTAS)) {
    if (!permitidas.includes(c.fuente)) continue;
    lineas.push(`- ${clave} (fuente ${c.fuente}): ${c.label}. Tipo ${c.tipo}. Alcances: ${c.alcances.join("/")}. Parámetros: ${c.parametros.join(", ") || "ninguno"}. Variables del mensaje: ${c.variables.map((v) => `{${v}}`).join(" ")}.`);
  }
  return lineas.join("\n");
}

function eventosTexto(permitidas) {
  return Object.entries(EVENTOS)
    .filter(([, e]) => permitidas.includes(e.fuente))
    .map(([clave, e]) => `- ${clave} (fuente ${e.fuente}): ${e.label}. Filtros: ${e.filtros.join(", ") || "ninguno"}.`)
    .join("\n");
}

function systemInstruction(permitidas, noPermitidas) {
  const hoy = new Date();
  return `Eres Nova, del Panel de Compras y Bienestar de Sinco. Conviertes un pedido de notificación, en español, en una REGLA estructurada. No ejecutas nada ni inventas cifras: la regla la ejecuta el sistema con consultas fijas.
Hoy es ${DIAS[hoy.getDay()]} ${ymd(hoy)} (zona horaria America/Bogota).

Hay DOS tipos de notificación ("disparador"):
A) "programado": a una hora/fecha, con una consulta. CONSULTAS DISPONIBLES para esta persona (clave exacta en "consulta"):
${catalogoTexto(permitidas) || "(ninguna)"}
B) "evento": sale EN EL MOMENTO en que pasa algo ("cuando…", "apenas…", "cada vez que…"). EVENTOS DISPONIBLES (clave exacta en "evento"):
${eventosTexto(permitidas) || "(ninguno)"}
   agrupacion: ${Object.entries(AGRUPACIONES).map(([k, v]) => `${k} = ${v}`).join("; ")}. Con evento NO hay hora ni festivo (no los preguntes), salvo con resumen_diario, que sí lleva "hora". Filtros: area (texto), puntajeMax 1-5 (valoración), estrellasMax 1-5 (calificación), soloFueraDePlazo (entregas), estadoCiclo (${Object.keys(ESTADOS_CICLO).join(", ")}), nivel de presupuesto (general | area | categoria; "por ítem" = categoria), soloExcedido (true = solo al pasar el 100 %), proveedor (NIT o nombre de UN proveedor concreto, para eventos de compras o de proveedores: "cuando actualicen a AVIANCA", "compras radicadas de Cafam"). Variables del mensaje de un evento: ${VARIABLES_EVENTO.map((v) => `{${v}}`).join(" ")}.

Valores válidos:
- periodo: ${Object.keys(PERIODOS).join(", ")} (con ultimos_n_dias usa "dias").
- campoFecha: fechaSolicitud (fecha de solicitud de la compra) | fechaRegistro (día en que se creó en el sistema).
- preset de lista_compras: ${Object.entries(PRESETS_COMPRAS).map(([k, v]) => `${k} = ${v}`).join("; ")}.
- preset de proveedores_ciclo: ${Object.entries(PRESETS_PROVEEDORES).map(([k, v]) => `${k} = ${v}`).join("; ")}.
- alcance: general (todos reciben lo mismo) | personal (cada quien recibe lo suyo, p. ej. solo las compras de las que es responsable).
- condicion: ${Object.keys(CONDICIONES).join(", ")} (umbral necesita "umbral" = mínimo de resultados).
- frecuencia: ${FRECUENCIAS.join(", ")}. diaria = cada día hábil. semanal usa diaSemana (0=domingo … 6=sábado). mensual usa diaMes (31 = fin de mes). mensual_semana usa ordinal (1..4, -1 = último) + diaSemana. unica usa fechaUnica YYYY-MM-DD.
- hora: "HH:mm" 24 h. siFestivo: ${Object.entries(SI_FESTIVO).map(([k, v]) => `${k} = ${v}`).join("; ")}.
- Variables del mensaje: ${Object.entries(VARIABLES).map(([k, v]) => `{${k}} = ${v}`).join("; ")}.

REGLAS:
1. Una notificación usa UNA sola consulta. Si el pedido necesita gráficas, el dashboard, un PDF, análisis o redacción larga, o varias fuentes a la vez: estado "es_informe" y explica en "mensaje" que eso se arma en Estudio de informes.
2. Si el pedido usa datos de una fuente que NO está en la lista (${noPermitidas.length ? noPermitidas.join(", ") : "ninguna"}): estado "no_permitido" y "fuenteNoPermitida" con su clave (${Object.keys(FUENTES).join(", ")}). No ofrezcas alternativas con esos datos.
3. Si no hay ninguna consulta que lo cubra: estado "no_soportado" y en "mensaje" qué sí se puede, con 2 o 3 ideas.
4. NUNCA supongas lo ambiguo: pregunta. Máximo 3 preguntas por turno, cada una con opciones cortas (2 a 4). Preguntas típicas: hora; qué hacer si el día es festivo; si se envía cuando no hay resultados; fecha de solicitud o de creación; lo de todos o lo de cada quien.
5. "Compras que se vencen": las compras NO tienen fecha de vencimiento. Se usa el plazo de 8 días hábiles desde la solicitud sin fecha de entrega: preset vencen_hoy (cumplen hoy el plazo), por_vencer (les quedan 1 o 2 días) o atrasadas (ya lo pasaron). Explícalo y pregunta si incluye también las ya vencidas.
6. La valoración de Nova de una compra se genera al RADICARLA, no al legalizarla: "cuando se legalice, dime qué valoración sacó" es el evento compra.valorada (explícalo en "mensaje"). La calificación del proveedor (estrellas) es compra.calificada. Si pide ambas (valoración y calificación), son DOS notificaciones: arma la primera y dilo en "mensaje".
6b. Este panel es de COMPRAS: no hay datos de ventas, ingresos ni facturación de clientes. Si dice "ventas", lo más probable es que se refiera a las compras registradas: usa la consulta de compras y PREGUNTA para confirmarlo ("¿Te refieres a las compras registradas?"). Nunca respondas "no_permitido" por esto: "no_permitido" es SOLO para una fuente de la lista de no permitidas.
7. Filtros (area, categoria, estado…): si la persona quiere "todas"/"todos"/"cualquiera", deja el filtro VACÍO; nunca escribas "todas" como valor. "Semana anterior" es de lunes a domingo. "Registradas" puede ser por fecha de solicitud o por creación: pregunta.
8. Cuando ya está todo, estado "lista": "nombre" corto, "titulo" corto (puede usar variables) y "plantilla" de 1 o 2 frases con variables, sin cifras inventadas; "resumen" en lenguaje claro de lo que hará.
9. Las respuestas que ya dio la persona son definitivas: no vuelvas a preguntarlas.
10. Con estado "preguntas" o "lista" llena SIEMPRE "disparador" y, según el tipo, "consulta" + "parametros" + "frecuencia" (programado) o "evento" + "parametros" (evento) con lo que ya se sabe: hacer preguntas no impide indicar cuál se usará.
11. En "explicitos" lista SOLO los campos que la persona dijo literalmente (hora, siFestivo, condicion, campoFecha, alcance, agrupacion). NO rellenes hora, siFestivo, condicion, campoFecha, alcance ni agrupacion si no los dijo: déjalos vacíos y pregunta.
12. Español de Colombia, tono cordial y breve. Usa el "id" de la pregunta igual al campo que define cuando aplique: hora, siFestivo, condicion, campoFecha, alcance, frecuencia, agrupacion, evento.`;
}

// Aplica de forma determinista las respuestas cuyo id es un campo de la regla.
function aplicarRespuestas(regla, respuestas) {
  for (const r of respuestas) {
    const v = r.valor ?? r.respuesta;
    if (v == null || v === "") continue;
    if (r.id === "hora" && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) regla.hora = String(v);
    else if (r.id === "siFestivo" && SI_FESTIVO[v]) regla.siFestivo = v;
    else if (r.id === "condicion" && CONDICIONES[v]) regla.condicion = v;
    else if (r.id === "alcance" && ["general", "personal"].includes(v)) regla.alcance = v;
    else if (r.id === "campoFecha" && CAMPOS_FECHA[v]) regla.parametros = { ...regla.parametros, campoFecha: v };
    else if (r.id === "frecuencia" && FRECUENCIAS.includes(v)) regla.frecuencia = v;
    else if (r.id === "agrupacion" && AGRUPACIONES[v]) regla.agrupacion = v;
    else if (r.id === "evento" && EVENTOS[v]) Object.assign(regla, { disparador: "evento", evento: v });
  }
  return regla;
}

const limpio = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ""));

// Fusiona la regla parcial anterior con lo nuevo de Nova y deja solo parámetros que la consulta admite.
function fusionar(previa, res) {
  const r = { ...limpio(previa), ...limpio({ ...res, parametros: undefined, preguntas: undefined, estado: undefined, mensaje: undefined, resumen: undefined, fuenteNoPermitida: undefined }) };
  r.parametros = { ...limpio(previa?.parametros), ...limpio(res.parametros) };
  for (const [k, v] of Object.entries(r.parametros)) if (typeof v === "string" && esSinFiltro(v)) delete r.parametros[k]; // "todas" = sin filtro
  r.disparador = r.evento && EVENTOS[r.evento] && (r.disparador === "evento" || !CONSULTAS[r.consulta]) ? "evento" : "programado";
  if (r.disparador === "evento") {
    const ev = EVENTOS[r.evento];
    r.consulta = "evento";
    r.parametros = Object.fromEntries(Object.entries(r.parametros).filter(([k]) => ev.filtros.includes(k)));
    if (ev.fuente !== "compras") r.alcance = "general";
    if (r.agrupacion && !AGRUPACIONES[r.agrupacion]) delete r.agrupacion;
    for (const k of ["frecuencia", "diaSemana", "diaMes", "ordinal", "fechaUnica", "siFestivo", "condicion", "umbral"]) delete r[k];
    if (r.agrupacion !== "resumen_diario") delete r.hora;
    return r;
  }
  delete r.evento;
  delete r.agrupacion;
  const def = CONSULTAS[r.consulta];
  if (def) {
    r.parametros = Object.fromEntries(Object.entries(r.parametros).filter(([k]) => def.parametros.includes(k)));
    if (r.alcance && !def.alcances.includes(r.alcance)) delete r.alcance;
    if (def.alcances.length === 1) r.alcance = def.alcances[0];
  }
  for (const k of ["diaSemana", "diaMes", "ordinal", "umbral"]) if (r[k] != null) r[k] = Number(r[k]);
  if (r.frecuencia && !FRECUENCIAS.includes(r.frecuencia)) delete r.frecuencia;
  if (r.siFestivo && !SI_FESTIVO[r.siFestivo]) delete r.siFestivo;
  if (r.condicion && !CONDICIONES[r.condicion]) delete r.condicion;
  if (r.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora)) delete r.hora;
  if (r.frecuencia === "diaria") r.siFestivo ||= "correr";
  return r;
}

// Nova tiende a "completar" lo ambiguo (8:00, siguiente día hábil, fecha de creación…). Esos campos solo se aceptan
// si la persona los dijo (explicitos, y para la hora además debe aparecer en el pedido) o si ya venían confirmados de
// un turno anterior; si no, se borran y preguntasFaltantes los vuelve pregunta.
const HORA_EN_TEXTO = /\b(a\s+las?\s+\d|\d{1,2}:\d{2}|\d{1,2}\s*(am|pm|a\.\s?m|p\.\s?m)|mediod[ií]a|medianoche)/i;

function sinSuposiciones(regla, previa, explicitos, pedido) {
  const dijo = new Set(Array.isArray(explicitos) ? explicitos : []);
  const out = { ...regla, parametros: { ...(regla.parametros || {}) } };
  const alcanceUnico = out.disparador === "evento" ? EVENTOS[out.evento]?.fuente !== "compras" : CONSULTAS[out.consulta]?.alcances.length === 1;
  for (const campo of ["hora", "siFestivo", "condicion", "alcance", "agrupacion"]) {
    if (out[campo] == null || previa?.[campo] != null) continue;
    const explicito = dijo.has(campo) && (campo !== "hora" || HORA_EN_TEXTO.test(pedido));
    if (!explicito && !(campo === "alcance" && alcanceUnico)) delete out[campo];
  }
  if (out.frecuencia === "diaria") out.siFestivo ||= "correr"; // "cada día hábil" no pregunta festivo
  if (out.parametros.campoFecha && previa?.parametros?.campoFecha == null && !dijo.has("campoFecha")) delete out.parametros.campoFecha;
  return out;
}

const PLANTILLAS = {
  conteo_compras: { titulo: "Compras: {periodo}", plantilla: "Se registraron {total} compras por {valor_total} ({periodo})." },
  lista_compras: { titulo: "Compras ({total})", plantilla: "Hay {total} compras por {valor_total}." },
  valoraciones_compras: { titulo: "Valoraciones de Nova: {periodo}", plantilla: "Nova valoró {total} compras ({periodo}). Puntaje promedio: {promedio}." },
  mis_pendientes: { titulo: "Tu día: {total} pendientes", plantilla: "Hola {nombre}, tienes {total} pendientes, {urgentes} urgentes." },
  proveedores_ciclo: { titulo: "Proveedores ({total})", plantilla: "Hay {total} proveedores en esta situación." },
  presupuesto_ejecucion: { titulo: "Presupuesto: {total} áreas sobre {umbral}", plantilla: "{total} áreas superan el {umbral} de su presupuesto." },
};

// Mensaje por defecto de una notificación por evento (al instante: un evento; agrupada: varios).
function plantillaEvento(evento, agrupacion) {
  const lote = agrupacion && agrupacion !== "inmediato";
  const base = {
    "compra.valorada": ["Nova valoró la compra {numero}", "{descripcion} ({proveedor}): compra {puntaje_compra}/5, proveedor {puntaje_proveedor}/5."],
    "compra.calificada": ["Calificación de proveedor en {numero}", "{proveedor} recibió {estrellas}★ por la compra {numero} ({descripcion})."],
    "compra.radicada": ["Compra radicada: {numero}", "{descripcion} · {proveedor} · {valor}."],
    "compra.legalizada": ["Compra legalizada: {numero}", "{descripcion} · {proveedor} · {valor}."],
    "compra.rechazada": ["Legalización rechazada: {numero}", "{descripcion} · {detalle}."],
    "compra.creada": ["Nueva compra {numero}", "{descripcion} · {area} · {valor}."],
    "compra.entregada": ["Compra entregada: {numero}", "{descripcion} · {detalle}."],
    "compra.anulada": ["Compra anulada: {numero}", "{descripcion} · {proveedor}."],
    "compra.eliminada": ["Compra eliminada: {numero}", "{descripcion} · {proveedor} · {valor} · {detalle}."],
    "compra.actualizada": ["Compra actualizada: {numero}", "{descripcion}: {detalle}."],
    "proveedor.actualizado": ["Proveedor actualizado: {proveedor}", "{proveedor}: {detalle}."],
    "proveedor.eliminado": ["Proveedor eliminado: {proveedor}", "{proveedor} · {detalle}."],
    "proveedor.creado": ["Nuevo proveedor: {proveedor}", "Se creó {proveedor} en el catálogo."],
    "proveedor.ciclo_cambio": ["Ciclo de proveedor: {proveedor}", "{proveedor}: {detalle}."],
    "presupuesto.umbral": ["Alerta de presupuesto: {descripcion}", "{descripcion}: {detalle}."],
    "presupuesto.actualizado": ["Cambio en el presupuesto: {descripcion}", "{descripcion}: {detalle}."],
  }[evento] || ["{evento}", "{evento}: {total}."];
  return lote ? { titulo: "{evento}: {total}", plantilla: "En este período: {total}. El detalle va abajo." } : { titulo: base[0], plantilla: base[1] };
}

// entrada: { pedido, respuestas: [{ id, pregunta, valor|respuesta }], reglaParcial, turno }
export async function interpretarPedido(entrada, user) {
  const pedido = String(entrada?.pedido || "").trim().slice(0, 1000);
  if (!pedido) throw Object.assign(new Error("Escribe qué quieres que te avise."), { status: 400 });
  const respuestas = Array.isArray(entrada.respuestas) ? entrada.respuestas.slice(0, 30) : [];
  // Edición por prompt: se parte de la regla actual y se cambia solo lo que se pide.
  const instruccion = String(entrada.instruccion || "").trim().slice(0, 1000);
  const editar = entrada.modo === "editar" && !!instruccion && !!entrada.reglaParcial;
  const turno = Math.max(1, parseInt(entrada.turno, 10) || 1);
  const permitidas = await fuentesPermitidas(user);
  const noPermitidas = Object.keys(FUENTES).filter((f) => !permitidas.includes(f));

  const res = await generateStructuredJson({
    systemInstruction: systemInstruction(permitidas, noPermitidas),
    prompt: [
      `Pedido: """${pedido}"""`,
      editar ? `MODO EDICIÓN. La notificación YA EXISTE con esta regla: ${JSON.stringify(entrada.reglaParcial).slice(0, 2000)}
Destinatarios actuales: ${(entrada.destinatariosNombres || []).join(", ") || "ninguno"}. Canales actuales: ${(entrada.canales || ["app"]).join(", ")}.
Cambio que pide la persona: """${instruccion}"""
Devuelve la regla COMPLETA con SOLO ese cambio aplicado (todo lo demás igual). Las personas que la reciben NO se cambian aquí (se eligen en la lista de la pantalla): si pide agregar o quitar personas, dilo en "mensaje" ("elígelas en la lista de abajo") y no cambies nada por eso. Si pide cambiar canales, "canales" ("app" siempre va; "teams" opcional; el correo está deshabilitado). Pon "estado": "lista" si el cambio es claro; si es ambiguo, pregunta. En "resumen" di en una frase qué cambiaste.` : null,
      !editar && entrada.reglaParcial ? `Regla entendida hasta ahora: ${JSON.stringify(entrada.reglaParcial).slice(0, 2000)}` : null,
      respuestas.length ? `Respuestas de la persona:\n${respuestas.map((r) => `- ${r.pregunta || r.id}: ${r.etiqueta || r.respuesta || r.valor}`).join("\n").slice(0, 3000)}` : null,
    ].filter(Boolean).join("\n\n"),
    schema: SCHEMA,
    budgetMs: 40000,
  });

  // Fuente no permitida: nunca se arma la regla. Se valida también si Nova eligió una consulta o evento de esa fuente.
  const esEvento = res.disparador === "evento" || (!!EVENTOS[res.evento] && !CONSULTAS[res.consulta]);
  const fuenteElegida = esEvento ? EVENTOS[res.evento]?.fuente : CONSULTAS[res.consulta]?.fuente;
  // "no_permitido" solo vale si de verdad apunta a una fuente que el rol NO ve; si Nova lo usa por error (p. ej. para
  // algo que el panel no tiene, como "ventas"), se trata como no soportado o se sigue con la consulta que eligió.
  const fuenteVetada = [res.fuenteNoPermitida, fuenteElegida].find((f) => FUENTES[f] && !permitidas.includes(f));
  if (res.estado === "no_permitido" && !fuenteVetada) res.estado = CONSULTAS[res.consulta] || EVENTOS[res.evento] ? "preguntas" : "no_soportado";
  if (fuenteVetada) {
    const fuente = fuenteVetada;
    return { estado: "no_permitido", mensaje: fuente ? mensajeSinPermiso(fuente) : "Por seguridad no puedes crear esta notificación: usa datos que tu rol no tiene habilitados." };
  }
  if (res.estado === "es_informe") {
    return { estado: "es_informe", mensaje: res.mensaje || "Eso es un informe: se arma en Estudio de informes, con gráficas y PDF.", puedeInformes: await isRoleAllowed(user.role, "viewReportes"), pedido };
  }
  if (!res.consulta && entrada.reglaParcial?.consulta) res.consulta = entrada.reglaParcial.consulta;
  if (!res.evento && entrada.reglaParcial?.evento) { res.evento = entrada.reglaParcial.evento; res.disparador ||= entrada.reglaParcial.disparador; }
  const reconocida = esEvento || entrada.reglaParcial?.disparador === "evento" ? !!EVENTOS[res.evento] : !!CONSULTAS[res.consulta];
  if (res.estado === "no_soportado" || !reconocida) {
    // Preguntas antes de poder elegir la consulta: se devuelven sin regla.
    if (res.estado === "preguntas" && res.preguntas?.length) {
      return { estado: "preguntas", mensaje: res.mensaje || null, resumen: res.resumen || null, regla: null, preguntas: res.preguntas.slice(0, 4) };
    }
    return { estado: "no_soportado", mensaje: res.mensaje || "No encontré una forma de armar esa notificación con los datos disponibles." };
  }

  const regla = aplicarRespuestas(sinSuposiciones(fusionar(entrada.reglaParcial, res), entrada.reglaParcial, res.explicitos, `${pedido} ${instruccion}`), respuestas);
  regla.pedido = pedido;
  const p = regla.disparador === "evento" ? plantillaEvento(regla.evento, regla.agrupacion) : PLANTILLAS[regla.consulta];
  regla.titulo ||= p.titulo;
  regla.plantilla ||= p.plantilla;
  regla.nombre ||= String(res.titulo || (regla.disparador === "evento" ? EVENTOS[regla.evento].label : CONSULTAS[regla.consulta].label)).slice(0, 120);

  // Preguntas: las de Nova (no respondidas) + las obligatorias del servidor, sin repetir, máximo 4.
  const respondidas = new Set(respuestas.map((r) => r.id));
  const obligatorias = preguntasFaltantes(regla);
  // Para los campos conocidos, las opciones son las del catálogo (valores que el servidor entiende); Nova pone el texto.
  const canonicas = Object.fromEntries([
    ...preguntasFaltantes({ consulta: regla.consulta, parametros: {}, frecuencia: "semanal" }),
    ...(regla.disparador === "evento" ? preguntasFaltantes({ disparador: "evento", evento: regla.evento, agrupacion: "resumen_diario" }) : []),
    ...(regla.disparador === "evento" ? preguntasFaltantes({ disparador: "evento", evento: regla.evento }) : []),
  ].map((q) => [q.id, q]));
  const horaCanonica = preguntasFaltantes({ consulta: "conteo_compras", parametros: {} }).find((q) => q.id === "hora");
  const deNova = (res.preguntas || [])
    .filter((q) => q?.id && !respondidas.has(q.id) && Array.isArray(q.opciones) && q.opciones.length)
    .map((q) => {
      if (q.id === "hora") {
        const validas = q.opciones.filter((o) => /^([01]\d|2[0-3]):[0-5]\d$/.test(o.valor));
        return { ...q, opciones: validas.length ? validas : (canonicas.hora || horaCanonica).opciones, permiteTexto: true };
      }
      return canonicas[q.id] ? { ...q, opciones: canonicas[q.id].opciones } : q;
    });
  // Por evento no se pregunta hora ni festivo (salvo la hora del resumen diario), aunque Nova lo intente.
  const noAplica = (q) => regla.disparador === "evento" && (q.id === "siFestivo" || q.id === "condicion" || q.id === "frecuencia" || (q.id === "hora" && regla.agrupacion !== "resumen_diario"));
  const preguntas = [...deNova.filter((q) => !noAplica(q)), ...obligatorias.filter((o) => !deNova.some((q) => q.id === o.id))].slice(0, 4)
    .map((q) => ({ id: String(q.id).slice(0, 40), texto: String(q.texto).slice(0, 300), opciones: q.opciones.slice(0, 5).map((o) => ({ valor: String(o.valor).slice(0, 60), etiqueta: String(o.etiqueta).slice(0, 80) })), permiteTexto: !!q.permiteTexto }));

  if (preguntas.length && turno >= LIMITES.maxTurnosNova) {
    return { estado: "manual", mensaje: "Completemos lo que falta a mano: revisa los campos marcados.", regla, faltan: obligatorias.map((o) => o.id) };
  }
  if (preguntas.length) {
    return { estado: "preguntas", mensaje: res.mensaje || null, resumen: res.resumen || null, regla, preguntas };
  }
  const extra = editar ? await aplicarEdicionPersonas(regla, res, entrada, user) : {};
  return {
    estado: "lista",
    mensaje: [res.mensaje, ...(extra.avisos || [])].filter(Boolean).join(" ") || null,
    resumen: res.resumen || null,
    regla,
    cuando: describirCuando(regla),
    proximas: proximasFechas(regla, 5),
    ...(editar ? { destinatarios: extra.destinatarios, canales: extra.canales, cambios: cambiosEntre(entrada.reglaParcial, regla, entrada, extra) } : {}),
  };
}

// ---------- Edición por prompt ----------

// Las personas se eligen en la lista visual, nunca con el prompt. Aquí solo se descartan las que ya no pueden recibir
// la fuente (si el cambio pasó, p. ej., de Compras a Presupuesto) y se aplican los canales que pidió.
async function aplicarEdicionPersonas(regla, res, entrada, user) {
  const fuente = regla.disparador === "evento" ? EVENTOS[regla.evento]?.fuente : CONSULTAS[regla.consulta]?.fuente;
  const elegibles = await destinatariosElegibles(fuente);
  const avisos = [];
  const ids = (entrada.destinatarios || []).filter((id) => elegibles.some((u) => u.id === id));
  if (ids.length < (entrada.destinatarios || []).length) {
    avisos.push(`Por seguridad se quitaron destinatarios sin acceso a ${FUENTES[fuente]?.label || fuente}.`);
  }
  let canales = entrada.canales || ["app"];
  if (Array.isArray(res.canales) && res.canales.length) {
    if (res.canales.includes("correo")) avisos.push("El correo está deshabilitado por ahora.");
    canales = ["app", ...(res.canales.includes("teams") ? ["teams"] : [])];
  }
  const nombres = Object.fromEntries(elegibles.map((u) => [u.id, u.nombre]));
  return { destinatarios: ids.map((id) => ({ userId: id, userNombre: id === user.id ? "Yo" : nombres[id] || id })), canales, avisos };
}

// Cambios legibles entre la regla anterior y la nueva (lo que se muestra antes de confirmar).
function cambiosEntre(antes, despues, entrada, extra) {
  const out = [];
  const lbl = (r) => (r.disparador === "evento" ? EVENTOS[r.evento]?.label : CONSULTAS[r.consulta]?.label) || "—";
  const par = (p) => Object.entries(p || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "sin filtros";
  const agregar = (campo, a, d) => { if (String(a ?? "") !== String(d ?? "")) out.push({ campo, antes: a || "—", despues: d || "—" }); };
  agregar("Cuándo", describirCuando(antes), describirCuando(despues));
  agregar("Qué datos", lbl(antes), lbl(despues));
  agregar("Filtros", par(antes.parametros), par(despues.parametros));
  if (despues.disparador !== "evento") agregar("Cuándo se envía", CONDICIONES[antes.condicion], CONDICIONES[despues.condicion]);
  agregar("Alcance", antes.alcance === "personal" ? "Solo lo de cada quien" : "Lo de todos", despues.alcance === "personal" ? "Solo lo de cada quien" : "Lo de todos");
  agregar("Nombre", antes.nombre, despues.nombre);
  agregar("Título", antes.titulo, despues.titulo);
  agregar("Mensaje", antes.plantilla, despues.plantilla);
  // Las personas se comparan por id (el nombre puede venir como "Yo"); solo cambian si se quitó alguien sin acceso.
  const antesIds = entrada.destinatarios || [];
  const despuesIds = (extra.destinatarios || []).map((d) => d.userId);
  if (antesIds.length !== despuesIds.length || antesIds.some((id) => !despuesIds.includes(id))) {
    agregar("Para", (entrada.destinatariosNombres || []).join(", "), (extra.destinatarios || []).map((d) => d.userNombre).join(", "));
  }
  agregar("Canales", (entrada.canales || ["app"]).map((c) => CANALES[c] || c).join(", "), (extra.canales || []).map((c) => CANALES[c] || c).join(", "));
  return out;
}
