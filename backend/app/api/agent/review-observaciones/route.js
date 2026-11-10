import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateStructuredJson } from "@/lib/aiStructured";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    suficiente: { type: "BOOLEAN" },
    comentario: { type: "STRING" },
    sugerencia: { type: "STRING", nullable: true },
  },
  required: ["suficiente", "comentario"],
};

// "Revisar con IA" en el campo Observaciones del registro — mismo patrón no
// streaming que agent/explain/route.js (generateStructuredJson), pero evalúa
// si el texto alcanza a justificar el estado de legalización en vez de explicar
// un KPI. Solo lo pueden usar roles que pueden editar el registro (mismo
// permiso que el campo que están revisando).
/**
 * @openapi
 * /api/agent/review-observaciones:
 *   post:
 *     tags: [Agente IA]
 *     summary: "\"Revisar con IA\" en el campo Observaciones del registro: evalúa si el texto justifica el estado de legalización y propone una mejora (requiere permiso \"editRecord\", el mismo del campo que revisa). Llamada síncrona (no usa el patrón de trabajo en segundo plano)."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [observaciones]
 *             properties:
 *               observaciones: { type: string }
 *               estadoLegalizacion: { type: string, nullable: true }
 *               descripcion: { type: string, nullable: true }
 *               area: { type: string, nullable: true }
 *               categoria: { type: string, nullable: true }
 *               proveedor: { type: string, nullable: true }
 *               valorConIva: { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Revisión generada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suficiente: { type: boolean }
 *                 comentario: { type: string }
 *                 sugerencia: { type: string, nullable: true }
 *       400:
 *         description: Falta escribir una observación.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "editRecord"))) {
    return jsonError("No autorizado.", 403);
  }

  const body = await request.json().catch(() => ({}));
  const { observaciones, estadoLegalizacion, descripcion, area, categoria, proveedor, valorConIva } = body;
  if (!observaciones || !String(observaciones).trim()) {
    return jsonError("Escribe una observación antes de revisarla.", 400);
  }

  const systemInstruction = `Eres un auxiliar de legalización de compras del Panel de Compras y Bienestar de Sinco. Te dan el campo "Observaciones" que un usuario escribió para justificar el estado de legalización de una compra, junto con el contexto de esa compra. Evalúa si el texto es una justificación completa y clara (debe explicar el motivo del estado actual — por qué está pendiente, qué falta, qué documento/fecha la respalda, etc., según corresponda).

Devuelve:
- "suficiente": true si el texto ya justifica adecuadamente el estado, false si falta información relevante (ej. no dice qué falta, no menciona fecha ni documento de respaldo, es demasiado vago).
- "comentario": 1-2 frases explicando tu veredicto — si falta algo, dilo concretamente (ej. "no indica el número de acta ni la fecha esperada de entrega del soporte").
- "sugerencia": si "suficiente" es false, una propuesta de texto mejorado y concreto para las observaciones (basada SOLO en los datos entregados, sin inventar fechas, montos ni documentos que no estén ahí); si "suficiente" es true, usa null.

Nunca inventes información que no esté en los datos entregados — si la observación es insuficiente por falta de datos que el usuario tendría que aportar, dilo en el comentario en vez de inventarlos en la sugerencia.`;

  const prompt = `Estado de legalización actual: ${estadoLegalizacion || "(sin definir)"}
Observaciones a revisar: "${observaciones}"

Contexto de la compra:
- Descripción: ${descripcion || "—"}
- Área: ${area || "—"}
- Categoría: ${categoria || "—"}
- Proveedor: ${proveedor || "—"}
- Valor con IVA: ${valorConIva ?? "—"}`;

  try {
    const result = await generateStructuredJson({ systemInstruction, prompt, schema: REVIEW_SCHEMA, budgetMs: 25000 });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err.message || "No se pudo revisar la observación.", 500);
  }
}
