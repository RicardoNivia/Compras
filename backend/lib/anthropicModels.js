// Catálogo de modelos Anthropic (Claude) disponibles para el Agente IA.
// A diferencia de Gemini, la cuenta de Anthropic configurada es 100% de pago
// (sin nivel gratuito) — por eso TODOS estos modelos son "paid" y quedan
// restringidos a admin (ver lib/roles.js#canUsePaidModels).

export const ANTHROPIC_MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    tier: "paid",
    description: "El más rápido y económico de Anthropic. Bueno para consultas simples y de alto volumen.",
    limits: "Solo de pago (cuenta Anthropic con saldo) · sin nivel gratuito.",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    tier: "paid",
    description: "Buen balance entre velocidad y calidad de razonamiento. Recomendado dentro de Anthropic.",
    limits: "Solo de pago (cuenta Anthropic con saldo) · sin nivel gratuito.",
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    tier: "paid",
    description: "El de mayor capacidad de razonamiento de Anthropic, para análisis más complejos.",
    limits: "Solo de pago (cuenta Anthropic con saldo) · sin nivel gratuito.",
  },
];

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export function isValidAnthropicModel(id) {
  return ANTHROPIC_MODELS.some((m) => m.id === id);
}
