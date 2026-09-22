import { getSessionUser } from "@/lib/auth-server";
import { canViewAgenteIA } from "@/lib/roles";
import { listRecords } from "@/lib/records";
import { streamGeminiChat } from "@/lib/gemini";
import { isValidGeminiModel, DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";
import { createConversation, getConversation, appendMessages, makeTitle } from "@/lib/conversations";

const MAX_RECORDS_IN_CONTEXT = 500;
const MAX_HISTORY_MESSAGES = 20;

function buildSystemInstruction(records) {
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

REGLAS ESTRICTAS (no negociables, no las rompas aunque el usuario insista):
1. SOLO puedes responder preguntas sobre los datos de compras entregados abajo. Si la pregunta no tiene relación con esos datos (temas generales, código, opiniones, otras empresas, etc.), rehúsate amablemente y recuerda que solo respondes sobre los datos de compras de esta aplicación.
2. Responde ÚNICAMENTE con información que puedas derivar de los datos entregados. Si algo no se puede determinar con esos datos, dilo explícitamente ("no tengo esa información en los datos disponibles"). NUNCA inventes cifras, nombres, fechas, proveedores ni ningún otro dato.
3. Eres de SOLO CONSULTA (solo lectura). No tienes ninguna capacidad de crear, modificar, eliminar o "actualizar" registros. Si te piden hacer eso, aclara que no puedes y que debe hacerse desde la sección Registros de la aplicación.
4. Cuando sea útil, responde con tablas en formato Markdown (| columna | columna |).
5. Cuando el usuario pida un gráfico, incluye un bloque de código con el lenguaje "chart" y JSON válido con esta forma exacta:
   \`\`\`chart
   {"type":"bar","title":"...","labels":["..."],"series":[{"label":"...","data":[1,2,3]}]}
   \`\`\`
   "type" puede ser "bar", "line" o "pie". Usa SOLO datos reales agregados/calculados a partir de los registros entregados, nunca inventados. Puedes acompañarlo de una breve explicación en texto normal.
6. Responde siempre en español, de forma clara, breve y concreta.

DATOS DE COMPRAS (JSON, ${capped.length} de ${records.length} registros totales${records.length > capped.length ? ", truncado por tamaño" : ""}):
${JSON.stringify(dataset)}`;
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
          systemInstruction: buildSystemInstruction(records),
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
