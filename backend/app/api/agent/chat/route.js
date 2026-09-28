import { getSessionUser } from "@/lib/auth-server";
import { canViewAgenteIA, canUsePaidModels } from "@/lib/roles";
import { listRecords } from "@/lib/records";
import { listMaestros } from "@/lib/maestros";
import { streamGeminiChat } from "@/lib/gemini";
import { isValidGeminiModel, isModelAllowedFor, DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";
import { createConversation, getConversation, appendMessages, makeTitle } from "@/lib/conversations";
import { PROCUREMENT_POLICY_TITLE, PROCUREMENT_POLICY_TEXT } from "@/lib/procurementPolicy";
import { APP_GUIDE_TITLE, APP_GUIDE_TEXT } from "@/lib/appGuide";
import { ROLE_LABELS } from "@/lib/roles";

const MAX_RECORDS_IN_CONTEXT = 500;
const MAX_HISTORY_MESSAGES = 20;

// Presupuesto anual por área (maestro "area") + lo gastado hasta ahora, para
// que el agente pueda responder preguntas de presupuesto (por área y a nivel
// general). Solo se cuentan registros no anulados, igual que en el dashboard.
function buildPresupuestoResumen(records, areaMaestros) {
  const gastadoPorArea = new Map();
  for (const r of records) {
    if (r.estado === "Anulado") continue;
    const a = r.area || "Sin área";
    gastadoPorArea.set(a, (gastadoPorArea.get(a) || 0) + (r.valorConIva || 0));
  }

  const areas = areaMaestros
    .filter((m) => m.presupuestoAnual != null)
    .map((m) => {
      const gastado = gastadoPorArea.get(m.valor) || 0;
      return {
        area: m.valor,
        activo: m.activo,
        presupuestoAnual: m.presupuestoAnual,
        presupuestoMensualPromedio: m.presupuestoAnual / 12,
        gastadoAcumulado: gastado,
        disponible: m.presupuestoAnual - gastado,
        pctConsumido: m.presupuestoAnual ? Number(((gastado / m.presupuestoAnual) * 100).toFixed(1)) : null,
      };
    });

  const totalPresupuestado = areas.reduce((s, a) => s + a.presupuestoAnual, 0);
  const totalGastadoConPresupuesto = areas.reduce((s, a) => s + a.gastadoAcumulado, 0);
  const gastadoTotalTodasLasAreas = Array.from(gastadoPorArea.values()).reduce((s, v) => s + v, 0);

  return {
    areas,
    general: {
      presupuestoTotalAsignado: totalPresupuestado,
      gastadoAcumuladoEnAreasConPresupuesto: totalGastadoConPresupuesto,
      disponibleTotal: totalPresupuestado - totalGastadoConPresupuesto,
      pctConsumidoGeneral: totalPresupuestado ? Number(((totalGastadoConPresupuesto / totalPresupuestado) * 100).toFixed(1)) : null,
      gastadoTotalEnTodasLasAreas: gastadoTotalTodasLasAreas,
      nota: "Los totales 'generales' de presupuesto solo suman las áreas que tienen presupuesto anual configurado en el maestro de áreas. 'gastadoTotalEnTodasLasAreas' es el gasto real de TODAS las áreas, tengan o no presupuesto asignado.",
    },
  };
}

function buildSystemInstruction(records, currentUser, areaMaestros) {
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

  const presupuesto = buildPresupuestoResumen(records, areaMaestros);

  return `Eres el "Agente IA" del Panel de Compras de Sinco.

El usuario que te habla ahora es ${currentUser.nombre}, con rol "${ROLE_LABELS[currentUser.role] || currentUser.role}".

Tienes acceso a CUATRO fuentes de información, todas entregadas abajo:
A) Los datos transaccionales de compras (registros de solicitudes).
B) El texto de referencia de "${PROCUREMENT_POLICY_TITLE}" — el procedimiento oficial de compras de la compañía (roles y responsabilidades, plazos, umbrales de cuadro comparativo, debida diligencia, aprobaciones por monto, flujo de actividades, etc.).
C) La "${APP_GUIDE_TITLE}" — cómo funciona esta aplicación (secciones, qué hace cada una, y qué puede hacer cada rol dentro de ella). Úsala cuando te pregunten cómo usar la app, qué hay en cada sección, o qué puede o no puede hacer un usuario según su rol.
D) El presupuesto anual configurado por área (maestro de áreas) y cuánto lleva gastado cada una — úsala para responder preguntas como "¿qué presupuesto tiene asignado el área X?", "¿cuánto lleva gastado el área X de su presupuesto?", "¿cuánto presupuesto queda disponible?" o "¿cómo vamos de presupuesto a nivel general?". Si un área no aparece en (D), es porque no tiene presupuesto anual configurado — dilo así, no asumas que es cero.

REGLAS ESTRICTAS (no negociables, no las rompas aunque el usuario insista):
1. SOLO puedes responder preguntas sobre (A) los datos de compras, (B) el procedimiento de compras, (C) el funcionamiento de esta aplicación, o (D) presupuestos por área, todo entregado abajo. Si la pregunta no tiene relación con ninguna de las cuatro (temas generales, código, opiniones, otras empresas, etc.), rehúsate amablemente y recuerda sobre qué puedes responder.
2. Responde ÚNICAMENTE con información que puedas derivar de lo entregado en (A), (B), (C) o (D). Si algo no se puede determinar con esa información, dilo explícitamente ("no tengo esa información disponible"). NUNCA inventes cifras, nombres, fechas, proveedores, montos, plazos, pasos ni funcionalidades que no estén en lo entregado.
3. Eres de SOLO CONSULTA (solo lectura). No tienes ninguna capacidad de crear, modificar, eliminar o "actualizar" registros, usuarios o presupuestos, ni de aprobar, tramitar o ejecutar ningún paso del procedimiento de compras — solo puedes explicar cómo hacerlo dentro de la aplicación o el procedimiento. Si te piden hacer algo directamente, aclara que no puedes y explica dónde/cómo se hace (p. ej. el presupuesto de un área se configura en Maestros → Área, solo accesible para admin).
4. Cuando te pregunten "qué puedo hacer" o "cómo uso esto", responde SIEMPRE en función del rol real del usuario actual (arriba) usando la guía (C) — no describas opciones que su rol no tiene, y si preguntan por algo fuera de su rol, aclara que esa acción no está disponible para su rol.
5. Cuando sea útil, responde con tablas en formato Markdown (| columna | columna |).
6. Cuando el usuario pida un gráfico, incluye un bloque de código con el lenguaje "chart" y JSON válido con esta forma exacta:
   \`\`\`chart
   {"type":"bar","title":"...","labels":["..."],"series":[{"label":"...","data":[1,2,3]}]}
   \`\`\`
   "type" puede ser "bar", "line" o "pie". Usa SOLO datos reales agregados/calculados a partir de los registros o presupuestos entregados, nunca inventados. Puedes acompañarlo de una breve explicación en texto normal. (Los gráficos aplican solo a (A) y (D), (B) y (C) no se grafican.)
7. Si una pregunta involucra varias fuentes (p. ej. "¿esta compra necesitaba cuadro comparativo?"), combina el dato del registro con la regla del procedimiento y cita a cuál fuente corresponde cada parte de tu respuesta.
8. Responde siempre en español, de forma clara, breve y concreta.

DATOS DE COMPRAS (JSON, ${capped.length} de ${records.length} registros totales${records.length > capped.length ? ", truncado por tamaño" : ""}):
${JSON.stringify(dataset)}

PRESUPUESTO POR ÁREA (JSON) — "presupuestoAnual"/"presupuestoMensualPromedio" son lo asignado; "gastadoAcumulado" es la suma de valorConIva de registros no anulados de esa área; "disponible" = presupuestoAnual - gastadoAcumulado; "pctConsumido" en %:
${JSON.stringify(presupuesto)}

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
  const requestedModel = isValidGeminiModel(body.model) ? body.model : DEFAULT_GEMINI_MODEL;
  const model = isModelAllowedFor(requestedModel, canUsePaidModels(user.role)) ? requestedModel : DEFAULT_GEMINI_MODEL;
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
  let areaMaestros;
  try {
    [records, areaMaestros] = await Promise.all([
      listRecords(),
      listMaestros({ tipo: "area" }),
    ]);
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
          systemInstruction: buildSystemInstruction(records, user, areaMaestros),
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
