import { createHash } from "crypto";
import { generateAnthropicJson } from "@/lib/anthropic";
import { DEFAULT_ANTHROPIC_MODEL, conModelos } from "@/lib/anthropicModels";

// Generación de JSON estructurado (Informes automáticos, moderación del
// Agente IA, "Explícame este número", etc.) — siempre con Anthropic (Claude),
// el único proveedor de IA configurado en la app.
// Caché corta de respuestas idénticas: si llega exactamente la misma petición (mismas instrucciones, mismos datos) en
// las próximas 2 horas, se devuelve la respuesta anterior sin volver a pagarla — p. ej. abrir dos veces el resumen de
// Mi día sin que cambien los pendientes, repetir "Explícame este número" o la misma búsqueda con IA. Como la clave
// incluye los datos, cualquier cambio en ellos produce una respuesta nueva. Nunca con imágenes; cache: false la evita.
const CACHE_MS = 2 * 60 * 60 * 1000;
const respuestas = globalThis.__aiStructuredCache || (globalThis.__aiStructuredCache = new Map());

export async function generateStructuredJson({ systemInstruction, prompt, schema, image, documento, budgetMs = 100000, cache = true }) {
  const usarCache = cache && !image && !documento;
  const clave = usarCache ? createHash("sha1").update(JSON.stringify([DEFAULT_ANTHROPIC_MODEL, systemInstruction, prompt, schema])).digest("hex") : null;
  if (clave) {
    const hit = respuestas.get(clave);
    if (hit && Date.now() - hit.at < CACHE_MS) return structuredClone(hit.value);
  }
  // Con respaldo entre modelos (ver lib/anthropicModels.js#conModelos).
  const { valor: value } = await conModelos((model) => generateAnthropicJson({
    model,
    systemInstruction,
    prompt,
    schema,
    image,
    documento,
    timeoutMs: budgetMs,
  }));
  if (clave) {
    respuestas.set(clave, { at: Date.now(), value: structuredClone(value) });
    if (respuestas.size > 300) respuestas.delete(respuestas.keys().next().value);
  }
  return value;
}
