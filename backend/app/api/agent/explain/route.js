import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { generateStructuredJson } from "@/lib/aiStructured";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

const EXPLAIN_SCHEMA = {
  type: "OBJECT",
  properties: { explanation: { type: "STRING" } },
  required: ["explanation"],
};

const MAX_RECORDS = 300;

// "Explícame este número": una explicación puntual en lenguaje natural de un
// KPI del Dashboard, a partir de los registros que lo componen (los manda el
// cliente, ya filtrados al periodo relevante — este endpoint no vuelve a
// consultar la base). Usa Anthropic (ver lib/aiStructured.js) — budget
// acotado porque esto corre síncrono dentro de
// una sola llamada HTTP (sujeta al límite de ~30s del proxy del frontend),
// no como trabajo en segundo plano.
/**
 * @openapi
 * /api/agent/explain:
 *   post:
 *     tags: [Agente IA]
 *     summary: "\"Explícame este número\": explicación puntual en lenguaje natural de un KPI del Dashboard, a partir de los registros que lo componen (los manda el cliente). Llamada síncrona (no usa el patrón de trabajo en segundo plano)."
 *     responses:
 *       200:
 *         description: Explicación generada.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { explanation: { type: string } }
 *       400:
 *         description: Falta el indicador a explicar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: No autenticado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label]
 *             properties:
 *               label: { type: string }
 *               value: { type: number, nullable: true }
 *               comparisonLabel: { type: string, nullable: true }
 *               comparisonValue: { type: number, nullable: true }
 *               records:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/Record' }
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return jsonError("No autorizado.", 401);

  const body = await request.json().catch(() => ({}));
  const { label, value, comparisonLabel, comparisonValue, records } = body;
  if (!label) return jsonError("Falta el indicador a explicar.", 400);

  const list = Array.isArray(records) ? records : [];
  const capped = list.slice(0, MAX_RECORDS);

  const systemInstruction = `Eres un analista de compras del Panel de Compras y Bienestar de Sinco. Te dan un indicador (KPI) del dashboard con su valor actual (y opcionalmente uno de comparación) más los registros de compra que lo componen. Explica en 2-4 frases, en español claro y concreto, por qué el indicador está en ese nivel o por qué cambió frente a la comparación, citando ejemplos puntuales (área, proveedor, monto, descripción) del listado cuando ayude a justificarlo. NUNCA inventes datos que no estén en los registros entregados; si no alcanza la información para explicarlo con certeza, dilo explícitamente en vez de adivinar.`;

  const prompt = `Indicador: "${label}"
Valor actual: ${value ?? "—"}
${comparisonLabel ? `Comparación (${comparisonLabel}): ${comparisonValue ?? "—"}` : "No hay periodo de comparación: explica la composición del valor actual."}

Registros relevantes (JSON, ${capped.length} de ${list.length}${list.length > capped.length ? ", truncado por tamaño" : ""}):
${JSON.stringify(capped)}`;

  try {
    const result = await generateStructuredJson({ systemInstruction, prompt, schema: EXPLAIN_SCHEMA, budgetMs: 25000 });
    return NextResponse.json({ explanation: result.explanation });
  } catch (err) {
    return jsonError(err.message || "No se pudo generar la explicación.", 500);
  }
}
