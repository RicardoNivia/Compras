import { generateAnthropicJson } from "@/lib/anthropic";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/anthropicModels";

// Generación de JSON estructurado (Informes automáticos, moderación del
// Agente IA, "Explícame este número", etc.) — siempre con Anthropic (Claude),
// el único proveedor de IA configurado en la app.
export async function generateStructuredJson({ systemInstruction, prompt, schema, budgetMs = 100000 }) {
  return generateAnthropicJson({
    model: DEFAULT_ANTHROPIC_MODEL,
    systemInstruction,
    prompt,
    schema,
    timeoutMs: budgetMs,
  });
}
