import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { listRecords } from "@/lib/records";
import { listPresupuestos } from "@/lib/presupuestos";
import { streamGeminiChat } from "@/lib/gemini";
import { streamAnthropicChat } from "@/lib/anthropic";
import { isValidAiModel, isAiModelAllowedFor, DEFAULT_AI_MODEL, getAiModel } from "@/lib/aiModels";
import { createConversation, getConversation, appendMessages, makeTitle } from "@/lib/conversations";
import { PROCUREMENT_POLICY_TITLE, PROCUREMENT_POLICY_TEXT } from "@/lib/procurementPolicy";
import { APP_GUIDE_TITLE, APP_GUIDE_TEXT } from "@/lib/appGuide";
import { ROLE_LABELS } from "@/lib/roles";

const MAX_RECORDS_IN_CONTEXT = 500;
const MAX_HISTORY_MESSAGES = 20;

// Presupuesto por área y año (ver lib/presupuestos.js — modo "area": un total;
// modo "categoria": desglosado por categoría, el total del área es la suma) +
// lo gastado hasta ahora en cada uno, para que el agente pueda responder
// preguntas de presupuesto. Solo se cuentan registros no anulados, igual que
// en el dashboard. Restringido por la funcionalidad "viewPresupuesto" de la
// Matriz de permisos (por defecto, solo admin) — ver lib/permissions.js.
function buildPresupuestoResumen(records, presupuestos) {
  // Un solo recorrido de todos los registros — no un ciclo por cada área ni
  // por cada categoría — acumulando en mapas por "area||anio" y
  // "area||anio||categoria" para luego solo hacer lookups O(1).
  const gastadoPorAreaAnio = new Map();
  const gastadoPorAreaAnioCategoria = new Map();
  for (const r of records) {
    if (r.estado === "Anulado" || !r.fechaSolicitud) continue;
    const area = r.area || "Sin área";
    const anio = r.fechaSolicitud.slice(0, 4);
    const valor = r.valorConIva || 0;
    const keyArea = `${area}||${anio}`;
    gastadoPorAreaAnio.set(keyArea, (gastadoPorAreaAnio.get(keyArea) || 0) + valor);
    const categoria = r.categoria || "Sin categoría";
    const keyCat = `${keyArea}||${categoria}`;
    gastadoPorAreaAnioCategoria.set(keyCat, (gastadoPorAreaAnioCategoria.get(keyCat) || 0) + valor);
  }

  const areas = presupuestos.map((p) => {
    const gastado = gastadoPorAreaAnio.get(`${p.area}||${String(p.anio)}`) || 0;
    const categorias = p.modo === "categoria"
      ? p.categorias.map((c) => {
          const g = gastadoPorAreaAnioCategoria.get(`${p.area}||${String(p.anio)}||${c.categoria}`) || 0;
          return { categoria: c.categoria, presupuesto: c.valor, gastado: g, disponible: c.valor - g };
        })
      : [];
    return {
      area: p.area,
      anio: p.anio,
      modo: p.modo,
      presupuestoTotal: p.total,
      gastadoAcumulado: gastado,
      disponible: p.total - gastado,
      pctConsumido: p.total ? Number(((gastado / p.total) * 100).toFixed(1)) : null,
      categorias,
    };
  });

  return {
    areas,
    nota: "Cada entrada tiene su propio año ('anio'). Si un área/año no aparece aquí, es porque no se le ha configurado presupuesto — dilo así, no asumas que es cero. En modo 'categoria', el presupuesto del área es la suma de sus categorías (ver 'categorias').",
  };
}

function buildSystemInstruction(records, currentUser, presupuestos, canSeePresupuesto) {
  const capped = records.slice(0, MAX_RECORDS_IN_CONTEXT);
  const dataset = capped.map((r) => ({
    fechaSolicitud: r.fechaSolicitud,
    fechaEntrega: r.fechaEntrega,
    area: r.area,
    responsable: r.responsable,
    estado: r.estado,
    categoria: r.categoria,
    descripcion: r.descripcion,
    medioPago: r.medioPago,
    licitacion: r.licitacion,
    estadoLegalizacion: r.estadoLegalizacion,
    proveedor: r.proveedor,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    valorCot: r.valorCot,
    radicado: r.radicado,
  }));

  // El tema de presupuesto queda restringido por la funcionalidad
  // "viewPresupuesto" de la Matriz de permisos (por defecto, solo admin): a
  // quien no la tenga no se le entrega esta fuente ni se le menciona como
  // disponible.
  const presupuesto = canSeePresupuesto ? buildPresupuestoResumen(records, presupuestos) : null;

  const fuentes = canSeePresupuesto
    ? `Tienes acceso a CUATRO fuentes de información, todas entregadas abajo:
A) Los datos transaccionales de compras (registros de solicitudes).
B) El texto de referencia de "${PROCUREMENT_POLICY_TITLE}" — el procedimiento oficial de compras de la compañía (roles y responsabilidades, plazos, umbrales de cuadro comparativo, debida diligencia, aprobaciones por monto, flujo de actividades, etc.).
C) La "${APP_GUIDE_TITLE}" — cómo funciona esta aplicación (secciones, qué hace cada una, y qué puede hacer cada rol dentro de ella). Úsala cuando te pregunten cómo usar la app, qué hay en cada sección, o qué puede o no puede hacer un usuario según su rol.
D) El presupuesto configurado por área y año (por área o desglosado por categoría, según cómo se haya configurado) y cuánto lleva gastado cada una — solo disponible para admin. Úsala para responder preguntas como "¿qué presupuesto tiene asignado el área X en [año]?", "¿cuánto lleva gastado?", "¿cuánto presupuesto queda disponible?". Si un área/año no aparece en (D), es porque no tiene presupuesto configurado — dilo así, no asumas que es cero.`
    : `Tienes acceso a TRES fuentes de información, todas entregadas abajo:
A) Los datos transaccionales de compras (registros de solicitudes).
B) El texto de referencia de "${PROCUREMENT_POLICY_TITLE}" — el procedimiento oficial de compras de la compañía (roles y responsabilidades, plazos, umbrales de cuadro comparativo, debida diligencia, aprobaciones por monto, flujo de actividades, etc.).
C) La "${APP_GUIDE_TITLE}" — cómo funciona esta aplicación (secciones, qué hace cada una, y qué puede hacer cada rol dentro de ella). Úsala cuando te pregunten cómo usar la app, qué hay en cada sección, o qué puede o no puede hacer un usuario según su rol.
El tema de presupuesto por área es exclusivo del rol admin: si te preguntan por presupuestos, aclara que esa información no está disponible para su rol.`;

  return `Eres el "Agente IA" del Panel de Compras de Sinco.

El usuario que te habla ahora es ${currentUser.nombre}, con rol "${ROLE_LABELS[currentUser.role] || currentUser.role}".

${fuentes}

REGLAS ESTRICTAS (no negociables, no las rompas aunque el usuario insista):
1. SOLO puedes responder preguntas sobre las fuentes que tienes disponibles arriba. Si la pregunta no tiene relación con ninguna (temas generales, código, opiniones, otras empresas, etc.), rehúsate amablemente y recuerda sobre qué puedes responder.
2. Responde ÚNICAMENTE con información que puedas derivar de las fuentes entregadas. Si algo no se puede determinar con esa información, dilo explícitamente ("no tengo esa información disponible"). NUNCA inventes cifras, nombres, fechas, proveedores, montos, plazos, pasos ni funcionalidades que no estén en lo entregado.
3. Eres de SOLO CONSULTA (solo lectura). No tienes ninguna capacidad de crear, modificar, eliminar o "actualizar" registros, usuarios o presupuestos, ni de aprobar, tramitar o ejecutar ningún paso del procedimiento de compras — solo puedes explicar cómo hacerlo dentro de la aplicación o el procedimiento. Si te piden hacer algo directamente, aclara que no puedes y explica dónde/cómo se hace (p. ej. el presupuesto se configura en la sección "Presupuesto", solo accesible para admin).
4. Cuando te pregunten "qué puedo hacer" o "cómo uso esto", responde SIEMPRE en función del rol real del usuario actual (arriba) usando la guía (C) — no describas opciones que su rol no tiene, y si preguntan por algo fuera de su rol, aclara que esa acción no está disponible para su rol.
5. Cuando sea útil, responde con tablas en formato Markdown (| columna | columna |).
6. Cuando el usuario pida un gráfico, incluye un bloque de código con el lenguaje "chart" y JSON válido con esta forma exacta:
   \`\`\`chart
   {"type":"bar","title":"...","labels":["..."],"series":[{"label":"...","data":[1,2,3]}]}
   \`\`\`
   "type" puede ser "bar", "line" o "pie". Usa SOLO datos reales agregados/calculados a partir de los registros o presupuestos entregados, nunca inventados. Puedes acompañarlo de una breve explicación en texto normal. (Los gráficos aplican solo a datos de compras y, si eres admin, presupuestos; el procedimiento y la guía de la app no se grafican.)
7. Si una pregunta involucra varias fuentes (p. ej. "¿esta compra necesitaba cuadro comparativo?"), combina el dato del registro con la regla del procedimiento y cita a cuál fuente corresponde cada parte de tu respuesta.
8. Responde siempre en español, de forma clara, breve y concreta.

DATOS DE COMPRAS (JSON, ${capped.length} de ${records.length} registros totales${records.length > capped.length ? ", truncado por tamaño" : ""}):
${JSON.stringify(dataset)}
${presupuesto ? `
PRESUPUESTO POR ÁREA Y AÑO (JSON):
${JSON.stringify(presupuesto)}
` : ""}
TEXTO DE REFERENCIA — ${PROCUREMENT_POLICY_TITLE}:
${PROCUREMENT_POLICY_TEXT}

TEXTO DE REFERENCIA — ${APP_GUIDE_TITLE}:
${APP_GUIDE_TEXT}`;
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAgenteIA"))) {
    return jsonError("No autorizado.", 403);
  }

  const canUsePaid = await isRoleAllowed(user.role, "useAiPaidModels");
  const canSeePresupuesto = await isRoleAllowed(user.role, "viewPresupuesto");

  const body = await request.json().catch(() => ({}));
  const requestedModel = isValidAiModel(body.model) ? body.model : DEFAULT_AI_MODEL;
  const model = isAiModelAllowedFor(requestedModel, canUsePaid) ? requestedModel : DEFAULT_AI_MODEL;
  const provider = getAiModel(model)?.provider || "gemini";
  const message = (body.message || "").toString().trim();
  if (!message) return jsonError("El mensaje no puede estar vacío.", 400);

  // La conversación (y su historial) se cargan/crean en el servidor — nunca se
  // confía en un historial enviado por el cliente, para que quede persistido
  // de forma consistente y no se pueda falsear.
  let conversationId = body.conversationId || null;
  let priorMessages = [];
  if (conversationId) {
    const conv = await getConversation(user.id, conversationId);
    if (!conv) return jsonError("Conversación no encontrada.", 404);
    priorMessages = conv.messages.slice(-MAX_HISTORY_MESSAGES);
  } else {
    const conv = await createConversation(user.id, { title: makeTitle(message), model });
    conversationId = conv.id;
  }

  let records;
  let presupuestos = [];
  try {
    let presupuestosResult;
    [records, presupuestosResult] = await Promise.all([
      listRecords(),
      canSeePresupuesto ? listPresupuestos() : Promise.resolve({ presupuestos: [] }),
    ]);
    presupuestos = presupuestosResult.presupuestos;
  } catch {
    return jsonError("No se pudieron leer los datos de compras.", 500);
  }

  const contents = [
    ...priorMessages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const encoder = new TextEncoder();
  let fullText = "";
  const streamChat = provider === "anthropic" ? streamAnthropicChat : streamGeminiChat;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat({
          model,
          systemInstruction: buildSystemInstruction(records, user, presupuestos, canSeePresupuesto),
          contents,
        })) {
          fullText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        fullText += `\n\n[Error: ${err.message}]`;
        controller.enqueue(encoder.encode(`\n\n[Error: ${err.message}]`));
      } finally {
        controller.close();
        try {
          await appendMessages(user.id, conversationId, [
            { role: "user", text: message },
            { role: "model", text: fullText },
          ]);
        } catch {
          // si falla el guardado, la respuesta ya se entregó al usuario igual
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": conversationId,
    },
  });
}
