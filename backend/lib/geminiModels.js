// Catálogo de modelos Gemini disponibles para el Agente IA.
// IDs verificados en vivo contra la Generative Language API con la clave
// configurada (sep-2026) — varios modelos "2.5" quedaron deprecados para
// cuentas nuevas, así que se usan los alias "-latest" cuando es posible
// (Google los mantiene apuntando siempre al modelo vigente de esa familia).
// Los límites de la capa gratuita son por proyecto y pueden cambiar; confírmalos
// en Google AI Studio antes de asumirlos como definitivos.

export const GEMINI_MODELS = [
  {
    id: "gemini-flash-lite-latest",
    label: "Gemini Flash-Lite (latest)",
    tier: "free",
    description: "El más rápido y económico. Ideal para consultas simples y de alto volumen.",
    limits: "Capa gratuita disponible · mayor límite de solicitudes/día",
  },
  {
    id: "gemini-flash-latest",
    label: "Gemini Flash (latest)",
    tier: "free",
    description: "Buen balance entre velocidad y calidad de análisis. Recomendado por defecto.",
    limits: "Capa gratuita disponible (cuota diaria limitada)",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    tier: "free",
    description: "Versión Flash más reciente y específica, mejor calidad de razonamiento que Flash-Lite.",
    limits: "Capa gratuita disponible (cuota diaria limitada)",
  },
  {
    id: "gemini-pro-latest",
    label: "Gemini Pro (latest)",
    tier: "paid",
    description: "El de mayor capacidad de razonamiento, para análisis más complejos.",
    limits: "Solo de pago · sin nivel gratuito",
  },
];

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export function isValidGeminiModel(id) {
  return GEMINI_MODELS.some((m) => m.id === id);
}

// Un modelo "paid" solo se puede usar si el rol tiene permiso (ver
// lib/roles.js#canUsePaidModels) — se pasa como booleano en vez de importar
// roles.js aquí para mantener este catálogo sin dependencias.
export function isModelAllowedFor(id, canUsePaid) {
  const model = GEMINI_MODELS.find((m) => m.id === id);
  if (!model) return false;
  return model.tier === "free" || canUsePaid;
}
