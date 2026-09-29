const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;
// Mismo criterio que lib/gemini.js: un solo intento con timeout generoso
// (en vez de varios cortos) — debe fallar con margen antes de que el proxy
// de rewrites del frontend corte la conexión a los ~30s.
const MAX_CONNECT_RETRIES = 0;
const CONNECT_TIMEOUT_MS = 25000;

async function fetchWithRetry(url, options) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      lastErr = err.name === "AbortError"
        ? new Error(`sin respuesta tras ${CONNECT_TIMEOUT_MS / 1000}s`)
        : err;
      if (attempt < MAX_CONNECT_RETRIES) continue;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `No se pudo conectar con Anthropic (falla de red). ` +
    `Verifica la conexión a internet o el proxy/firewall corporativo. Detalle: ${lastErr?.cause?.code || lastErr?.message || lastErr}`
  );
}

// "contents" llega en el mismo formato usado en toda la ruta de chat
// ({role: "user"|"model", parts:[{text}]}, estilo Gemini) para que quien
// arma la conversación no tenga que conocer el formato propio de cada
// proveedor — aquí se traduce al formato de mensajes de Anthropic.
function toAnthropicMessages(contents) {
  return contents.map((c) => ({
    role: c.role === "model" ? "assistant" : "user",
    content: (c.parts || []).map((p) => p.text || "").join(""),
  }));
}

// Llama a la Messages API de Anthropic en modo streaming (SSE) y va
// entregando (yield) cada fragmento de texto a medida que llega.
export async function* streamAnthropicChat({ model, systemInstruction, contents }) {
  const apiKey = process.env.ANTROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTROPIC_API_KEY no está configurada en el servidor.");
  }

  const res = await fetchWithRetry(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: systemInstruction,
      messages: toAnthropicMessages(contents),
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      // ignore
    }
    throw new Error(`Anthropic API respondió ${res.status}. ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) continue;

      let evt;
      try {
        evt = JSON.parse(jsonStr);
      } catch {
        continue; // fragmento parcial no parseable todavía; se ignora
      }

      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        if (evt.delta.text) yield evt.delta.text;
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "Error de la API de Anthropic.");
      }
    }
  }
}
