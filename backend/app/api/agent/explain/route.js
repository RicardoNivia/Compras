import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { generateGeminiJson } from "@/lib/gemini";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";

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
// consultar la base). Siempre con el modelo gratis de Gemini, sin streaming
// (respuesta corta, no hace falta el efecto "escribiendo…").
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return jsonError("No autorizado.", 401);

  const body = await request.json().catch(() => ({}));
  const { label, value, comparisonLabel, comparisonValue, records } = body;
  if (!label) return jsonError("Falta el indicador a explicar.", 400);

  const list = Array.isArray(records) ? records : [];
  const capped = list.slice(0, MAX_RECORDS);

  const systemInstruction = `Eres un analista de compras del Panel de Compras de Sinco. Te dan un indicador (KPI) del dashboard con su valor actual (y opcionalmente uno de comparación) más los registros de compra que lo componen. Explica en 2-4 frases, en español claro y concreto, por qué el indicador está en ese nivel o por qué cambió frente a la comparación, citando ejemplos puntuales (área, proveedor, monto, descripción) del listado cuando ayude a justificarlo. NUNCA inventes datos que no estén en los registros entregados; si no alcanza la información para explicarlo con certeza, dilo explícitamente en vez de adivinar.`;

  const prompt = `Indicador: "${label}"
Valor actual: ${value ?? "—"}
${comparisonLabel ? `Comparación (${comparisonLabel}): ${comparisonValue ?? "—"}` : "No hay periodo de comparación: explica la composición del valor actual."}

Registros relevantes (JSON, ${capped.length} de ${list.length}${list.length > capped.length ? ", truncado por tamaño" : ""}):
${JSON.stringify(capped)}`;

  try {
    const result = await generateGeminiJson({
      model: DEFAULT_GEMINI_MODEL,
      systemInstruction,
      prompt,
      schema: EXPLAIN_SCHEMA,
    });
    return NextResponse.json({ explanation: result.explanation });
  } catch (err) {
    return jsonError(err.message || "No se pudo generar la explicación.", 500);
  }
}
