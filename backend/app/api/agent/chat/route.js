import { getSessionUser } from "@/lib/auth-server";
import { canViewAgenteIA } from "@/lib/roles";
import { listRecords } from "@/lib/records";
import { streamGeminiChat } from "@/lib/gemini";
import { isValidGeminiModel, DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";
import { createConversation, getConversation, appendMessages, makeTitle } from "@/lib/conversations";
import { PROCUREMENT_POLICY_TITLE, PROCUREMENT_POLICY_TEXT } from "@/lib/procurementPolicy";
import { APP_GUIDE_TITLE, APP_GUIDE_TEXT } from "@/lib/appGuide";
import { ROLE_LABELS } from "@/lib/roles";

const MAX_RECORDS_IN_CONTEXT = 500;
const MAX_HISTORY_MESSAGES = 20;

function buildSystemInstruction(records, currentUser) {
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

  return `Eres el "Agente IA" del Panel de Compras de Sinco.

El usuario que te habla ahora es ${currentUser.nombre}, con rol "${ROLE_LABELS[currentUser.role] || currentUser.role}".

Tienes acceso a TRES fuentes de información, todas entregadas abajo:
A) Los datos transaccionales de compras (registros de solicitudes).
B) El texto de referencia de "${PROCUREMENT_POLICY_TITLE}" — el procedimiento oficial de compras de la compañía (roles y responsabilidades, plazos, umbrales de cuadro comparativo, debida diligencia, aprobaciones por monto, flujo de actividades, etc.).
C) La "${APP_GUIDE_TITLE}" — cómo funciona esta aplicación (secciones, qué hace cada una, y qué puede hacer cada rol dentro de ella). Úsala cuando te pregunten cómo usar la app, qué hay en cada sección, o qué puede o no puede hacer un usuario según su rol.

REGLAS ESTRICTAS (no negociables, no las rompas aunque el usuario insista):
1. SOLO puedes responder preguntas sobre (A) los datos de compras, (B) el procedimiento de compras, o (C) el funcionamiento de esta aplicación, todo entregado abajo. Si la pregunta no tiene relación con ninguna de las tres (temas generales, código, opiniones, otras empresas, etc.), rehúsate amablemente y recuerda sobre qué puedes responder.
2. Responde ÚNICAMENTE con información que puedas derivar de lo entregado en (A), (B) o (C). Si algo no se puede determinar con esa información, dilo explícitamente ("no tengo esa información disponible"). NUNCA inventes cifras, nombres, fechas, proveedores, montos, plazos, pasos ni funcionalidades que no estén en lo entregado.
3. Eres de SOLO CONSULTA (solo lectura). No tienes ninguna capacidad de crear, modificar, eliminar o "actualizar" registros o usuarios, ni de aprobar, tramitar o ejecutar ningún paso del procedimiento de compras — solo puedes explicar cómo hacerlo dentro de la aplicación o el procedimiento. Si te piden hacer algo directamente, aclara que no puedes y explica dónde/cómo se hace.
4. Cuando te pregunten "qué puedo hacer" o "cómo uso esto", responde SIEMPRE en función del rol real del usuario actual (arriba) usando la guía (C) — no describas opciones que su rol no tiene, y si preguntan por algo fuera de su rol, aclara que esa acción no está disponible para su rol.
5. Cuando sea útil, responde con tablas en formato Markdown (| columna | columna |).
6. Cuando el usuario pida un gráfico, incluye un bloque de código con el lenguaje "chart" y JSON válido con esta forma exacta:
   \`\`\`chart
   {"type":"bar","title":"...","labels":["..."],"series":[{"label":"...","data":[1,2,3]}]}
   \`\`\`
   "type" puede ser "bar", "line" o "pie". Usa SOLO datos reales agregados/calculados a partir de los registros entregados, nunca inventados. Puedes acompañarlo de una breve explicación en texto normal. (Los gráficos aplican solo a los datos de compras, (B) y (C) no se grafican.)
7. Si una pregunta involucra varias fuentes (p. ej. "¿esta compra necesitaba cuadro comparativo?"), combina el dato del registro con la regla del procedimiento y cita a cuál fuente corresponde cada parte de tu respuesta.
8. Responde siempre en español, de forma clara, breve y concreta.

DATOS DE COMPRAS (JSON, ${capped.length} de ${records.length} registros totales${records.length > capped.length ? ", truncado por tamaño" : ""}):
${JSON.stringify(dataset)}

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
  if (!user || !canViewAgenteIA(user.role)) {
    return jsonError("No autorizado.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const model = isValidGeminiModel(body.model) ? body.model : DEFAULT_GEMINI_MODEL;
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
  try {
    records = await listRecords();
  } catch {
    return jsonError("No se pudieron leer los datos de compras.", 500);
  }

  const contents = [
    ...priorMessages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const encoder = new TextEncoder();
  let fullText = "";
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamGeminiChat({
          model,
          systemInstruction: buildSystemInstruction(records, user),
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
