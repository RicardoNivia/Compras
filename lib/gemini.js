const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Llama a la Generative Language API en modo streaming (SSE) y va entregando
// (yield) cada fragmento de texto a medida que llega, para el efecto "escribiendo…".
export async function* streamGeminiChat({ model, systemInstruction, contents }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada en el servidor.");
  }

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      // ignore
    }
    throw new Error(`Gemini API respondió ${res.status}. ${detail}`);
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
      try {
        const chunk = JSON.parse(jsonStr);
        const text = (chunk?.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || "")
          .join("");
        if (text) yield text;
      } catch {
        // fragmento parcial no parseable todavía; se ignora
      }
    }
  }
}
