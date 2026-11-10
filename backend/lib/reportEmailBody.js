import { generateStructuredJson } from "@/lib/aiStructured";

const BODY_SCHEMA = {
  type: "OBJECT",
  properties: { texto: { type: "STRING" } },
  required: ["texto"],
};

// Versión en texto plano del HTML que el usuario escribe en el editor del
// cuerpo del correo (ver ReportBodyEditor.jsx) — se usa como "text" del
// correo (fallback para clientes que no renderizan HTML) junto al "html" real.
export function stripHtmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Resuelve el cuerpo del correo a enviar: si el informe tiene "cuerpoHtml"
// (editado directamente por el usuario, ver ReportBodyEditor.jsx), se usa tal
// cual (con su versión en texto plano como respaldo) — sin IA, sin red, al
// instante. Si no (informes guardados antes de ese cambio), cae al flujo
// legado por IA (generateEmailBody, más abajo).
export async function resolveEmailBody({ cuerpoHtml, content, nombre, cuerpoModo, cuerpoPrompt }) {
  if (cuerpoHtml && cuerpoHtml.trim()) {
    return { html: cuerpoHtml, text: stripHtmlToText(cuerpoHtml) };
  }
  const text = await generateEmailBody({ content, nombre, cuerpoModo, cuerpoPrompt });
  return { html: null, text };
}

const CUERPO_IA_SYSTEM_INSTRUCTION = `Eres un asistente de redacción de correos corporativos en español. Te dan el texto actual del cuerpo de un correo (que acompaña un informe de compras adjunto en PDF, escrito directamente por un administrador). Revisa ortografía, gramática y claridad, y propone una redacción alternativa — más clara, profesional y concisa — manteniendo el mismo mensaje e intención. Nunca inventes datos, cifras, nombres ni compromisos que no estén en el texto original; si el texto está vacío o no tiene sentido, dilo en el propio "texto" de respuesta en vez de inventar contenido genérico de relleno. Devuelve SIEMPRE texto plano (párrafos separados por una línea en blanco), nunca HTML ni Markdown.`;

// Botón "Mejorar con IA" del editor del cuerpo del correo (ver
// ReportBodyEditor.jsx): valida/reescribe el texto que el usuario ya
// escribió — nunca genera el cuerpo desde cero ni reemplaza nada sin que el
// usuario vea la propuesta primero.
export async function generateCuerpoCorreoSugerido(textoActual) {
  const prompt = `Texto actual del cuerpo del correo:\n"""${textoActual}"""`;
  return generateStructuredJson({ systemInstruction: CUERPO_IA_SYSTEM_INSTRUCTION, prompt, schema: BODY_SCHEMA, budgetMs: 30000 });
}

function summaryLines(content) {
  return (content?.secciones || [])
    .map((s) => `- ${s.titulo}${s.destacado ? `: ${s.destacado}` : ""}`)
    .join("\n");
}

// Texto plano por defecto (sin IA) — siempre disponible como respaldo, así
// una falla de red nunca bloquea el envío del correo (ver generateEmailBody).
// "plano": solo avisa que el PDF va adjunto. "resumen": además lista los
// títulos/datos destacados de cada sección del informe (texto, no HTML).
export function buildDefaultEmailBody(content, { nombre, cuerpoModo }) {
  const saludo = content?.saludo || "Buen día,";
  const cierre = content?.cierre || "Quedamos atentos a cualquier inquietud.";
  if (cuerpoModo === "resumen") {
    return `${saludo}\n\nResumen de "${nombre}":\n${summaryLines(content)}\n\nEncuentra el detalle completo, con gráficas, en el PDF adjunto.\n\n${cierre}`;
  }
  return `${saludo}\n\nEncuentra adjunto el informe "${nombre}", generado automáticamente por el Panel de Compras y Bienestar de Sinco.\n\n${cierre}`;
}

// Cuerpo del correo en TEXTO PLANO (nunca HTML) — independiente del contenido
// del PDF adjunto. Si el admin no dio "cuerpoPrompt", se usa el texto
// determinístico de buildDefaultEmailBody (sin llamar a la IA). Si lo dio, se
// se pide a la IA (Anthropic — ver lib/aiStructured.js)
// que lo redacte siguiendo el estilo pedido, pero SIEMPRE con fallback al
// texto por defecto si ningún modelo responde — nunca se bloquea un envío por esto.
export async function generateEmailBody({ content, nombre, cuerpoModo, cuerpoPrompt }) {
  const fallback = buildDefaultEmailBody(content, { nombre, cuerpoModo });
  if (!cuerpoPrompt || !cuerpoPrompt.trim()) return fallback;

  try {
    const systemInstruction = `Redacta el cuerpo de un correo ejecutivo en TEXTO PLANO para acompañar un informe de compras que se adjunta como PDF. Sigue esta instrucción de estilo/tono del administrador: "${cuerpoPrompt.trim()}". ${
      cuerpoModo === "resumen"
        ? "Incluye un resumen breve (máximo 4-5 líneas, en prosa o con viñetas simples que empiecen con \"- \") de los puntos más relevantes del informe."
        : "Mantenlo breve y genérico — NO resumas cifras ni secciones, el detalle completo va en el PDF adjunto."
    } Básate solo en el contenido entregado, nunca inventes cifras ni datos que no estén ahí.

REGLA ESTRICTA DE FORMATO: esto es texto plano puro, no HTML ni Markdown. Prohibido usar: tablas (ninguna forma, ni con "|" ni con guiones como separador de columnas), encabezados con "#", negritas con "**", numeración con columnas alineadas, ni ningún otro formato que dependa de una fuente monoespaciada — en un cliente de correo normal se ve descuadrado y desordenado. Si necesitas comparar varios valores (ej. presupuesto por área), descríbelos en frases o en una lista simple de viñetas de una sola columna ("- Infraestructura: 699,9% del presupuesto"), nunca en formato de tabla. El detalle tabular completo ya va en el PDF adjunto.`;
    const prompt = `Nombre del informe: "${nombre}"\nContenido del informe (JSON): ${JSON.stringify(content)}`;
    // Presupuesto corto: esto es una personalización de "buena fe" con
    // fallback seguro (buildDefaultEmailBody) — no debe competir por el
    // mismo margen de tiempo que la generación principal del informe
    // (generateReportContent), sobre todo cuando ambas corren en paralelo
    // (ver preview/route.js y send-now/route.js).
    const res = await generateStructuredJson({ systemInstruction, prompt, schema: BODY_SCHEMA, budgetMs: 20000 });
    return res?.texto?.trim() || fallback;
  } catch {
    return fallback;
  }
}
