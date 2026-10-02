import { generateGeminiJson } from "@/lib/gemini";
import { generateAnthropicJson } from "@/lib/anthropic";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/anthropicModels";

// Orden de intento para generación de JSON estructurado (Informes
// automáticos): Gemini por defecto, y si falla salta a Anthropic Haiku (ver
// anthropicModels.js#DEFAULT_ANTHROPIC_MODEL). El primer intento (Gemini)
// tiene un timeout corto a propósito: cuando falla en este entorno lo hace
// sin responder en absoluto, así que darle más tiempo no ayuda, solo le
// resta presupuesto al segundo intento (Anthropic), que es el que de verdad
// termina respondiendo. Generar un informe a partir de cientos de registros
// + agregados + tablas/gráficas es una tarea pesada que puede tardar
// legítimamente ~90s, no solo una falla de red breve — por eso esto corre
// como trabajo en segundo plano (ver lib/reportJobs.js) en vez de dentro de
// una sola llamada HTTP del navegador, y el presupuesto puede ser generoso
// sin el límite de ~30s que el proxy de rewrites del frontend le impondría
// a una respuesta síncrona (ver el comentario en lib/gemini.js).
const CANDIDATES = [
  { provider: "gemini", id: DEFAULT_GEMINI_MODEL, maxMs: 10000 },
  { provider: "anthropic", id: DEFAULT_ANTHROPIC_MODEL, maxMs: 100000 },
];

const TOTAL_BUDGET_MS = 110000;
const MIN_PER_ATTEMPT_MS = 5000;

// "budgetMs" permite acotar el presupuesto para llamadas de menor prioridad
// (ej. personalizar el cuerpo del correo — ver reportEmailBody.js) que ya
// tienen un resultado de respaldo seguro y no deben competir por el mismo
// margen de tiempo que la generación principal del informe.
export async function generateStructuredJson({ systemInstruction, prompt, schema, budgetMs = TOTAL_BUDGET_MS }) {
  const deadline = Date.now() + budgetMs;
  let lastErr;
  for (const { provider, id, maxMs } of CANDIDATES) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_PER_ATTEMPT_MS) break; // sin tiempo suficiente para un intento con chance real
    const timeoutMs = Math.min(maxMs, remaining);
    try {
      if (provider === "gemini") {
        return await generateGeminiJson({ model: id, systemInstruction, prompt, schema, timeoutMs });
      }
      return await generateAnthropicJson({ model: id, systemInstruction, prompt, schema, timeoutMs });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Ningún modelo de IA configurado pudo generar la respuesta.");
}
