import { runAnthropicAgentChat } from "@/lib/anthropic";
import { conModelos } from "@/lib/anthropicModels";

// Único proveedor de IA configurado en la app: todos los roles usan el mismo
// modelo de Anthropic (ver lib/anthropicModels.js#DEFAULT_ANTHROPIC_MODEL).
// Usa "tool use" (ver lib/agentTools.js y anthropic.js#runAnthropicAgentChat)
// en vez de recibir todos los datos de compras en el system prompt — el
// modelo consulta solo lo que necesita para cada pregunta.
// "staticPrefix" (si llega) se marca como cacheable del lado de Anthropic —
// ver anthropic.js#cacheableSystemPrefix y chat/route.js#buildStaticInstructionPrefix.
export async function* streamChatCascade({ staticPrefix, systemInstruction, contents, tools, executeTool }) {
  // Con respaldo: si el modelo principal falla (en producción Opus 5.5), se repite con el siguiente (Sonnet 5.5).
  const { valor: text } = await conModelos((model) => runAnthropicAgentChat({
    model,
    cacheableSystemPrefix: staticPrefix,
    systemInstruction,
    contents,
    tools,
    executeTool,
  }));
  yield text;
}
