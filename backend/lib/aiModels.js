// Catálogo combinado de todos los modelos disponibles en el Agente IA
// (Gemini + Anthropic), cada uno con "provider" para que quien llama sepa a
// qué API despachar — así la validación/permiso de modelo vive en un solo
// lugar en vez de repetirse por proveedor en cada punto que elige el modelo.
import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";
import { ANTHROPIC_MODELS } from "@/lib/anthropicModels";

export const AI_MODELS = [
  ...GEMINI_MODELS.map((m) => ({ ...m, provider: "gemini" })),
  ...ANTHROPIC_MODELS.map((m) => ({ ...m, provider: "anthropic" })),
];

export const DEFAULT_AI_MODEL = DEFAULT_GEMINI_MODEL;

export function getAiModel(id) {
  return AI_MODELS.find((m) => m.id === id) || null;
}

export function isValidAiModel(id) {
  return AI_MODELS.some((m) => m.id === id);
}

// Un modelo "paid" (incluye TODOS los de Anthropic) solo se puede usar si el
// rol tiene permiso — ver lib/roles.js#canUsePaidModels.
export function isAiModelAllowedFor(id, canUsePaid) {
  const model = getAiModel(id);
  if (!model) return false;
  return model.tier === "free" || canUsePaid;
}
