import { streamGeminiChat } from "@/lib/gemini";
import { streamAnthropicChat } from "@/lib/anthropic";
import { GEMINI_MODELS } from "@/lib/geminiModels";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/anthropicModels";

const FREE_GEMINI_MODEL_IDS = GEMINI_MODELS.filter((m) => m.tier === "free").map((m) => m.id);

// El usuario ya no elige el modelo del chat (ver AgenteChat.jsx): se prueban
// automáticamente, en orden, todos los modelos gratuitos de Gemini del
// catálogo (geminiModels.js) y, solo si TODOS fallan sin responder nada, se
// cae como último recurso a Anthropic (de pago) — y solo si el rol tiene
// permiso de usar modelos de pago; si no, un fallo total de Gemini se reporta
// como error en vez de incurrir en un costo que ese rol no puede autorizar.
export async function* streamChatCascade({ systemInstruction, contents, canUsePaid }) {
  const candidatos = [
    ...FREE_GEMINI_MODEL_IDS.map((id) => ({ provider: "gemini", id })),
    ...(canUsePaid ? [{ provider: "anthropic", id: DEFAULT_ANTHROPIC_MODEL }] : []),
  ];

  let lastErr;
  for (const { provider, id } of candidatos) {
    const streamFn = provider === "anthropic" ? streamAnthropicChat : streamGeminiChat;
    let yieldedAny = false;
    try {
      for await (const chunk of streamFn({ model: id, systemInstruction, contents })) {
        yieldedAny = true;
        yield chunk;
      }
      return; // terminó sin lanzar error — éxito, no se prueban más modelos
    } catch (err) {
      lastErr = err;
      // Si ya se había entregado texto de este modelo, no se puede "reintentar"
      // sin duplicar/corromper lo que el usuario ya vio — se deja así en vez
      // de saltar al siguiente modelo.
      if (yieldedAny) return;
    }
  }
  throw lastErr || new Error("Ningún modelo de IA configurado pudo generar la respuesta.");
}
