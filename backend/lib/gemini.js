const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// El proxy de rewrites del frontend (next.config.js) corta la conexión a los
// ~30s si no ha recibido ningún byte de respuesta todavía — así que el peor
// caso (MAX_CONNECT_RETRIES+1 intentos × CONNECT_TIMEOUT_MS) debe quedar por
// debajo de eso, o el usuario ve un "Internal Server Error" 500 genérico del
// proxy en vez del mensaje de error real del agente. Un solo intento con un
// timeout generoso (en vez de varios cortos) deja más margen para prompts
// grandes (todo el dataset de compras + presupuestos + políticas) en redes
// lentas, sin dejar de fallar con tiempo de sobra antes del corte del proxy.
const MAX_CONNECT_RETRIES = 0;
const CONNECT_TIMEOUT_MS = 25000;

async function fetchWithRetry(url, options, timeoutMs = CONNECT_TIMEOUT_MS) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      // Timeout (sin respuesta del todo, común en redes corporativas que
      // descartan el tráfico en silencio) o falla de conexión — no es un
      // error de la API, se reintenta hasta MAX_CONNECT_RETRIES veces.
      lastErr = err.name === "AbortError"
        ? new Error(`sin respuesta tras ${timeoutMs / 1000}s`)
        : err;
      if (attempt < MAX_CONNECT_RETRIES) continue;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `No se pudo conectar con Gemini (falla de red). ` +
    `Verifica la conexión a internet o el proxy/firewall corporativo. Detalle: ${lastErr?.cause?.code || lastErr?.message || lastErr}`
  );
}

// Llama a la Generative Language API en modo streaming (SSE) y va entregando
// (yield) cada fragmento de texto a medida que llega, para el efecto "escribiendo…".
export async function* streamGeminiChat({ model, systemInstruction, contents }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada en el servidor.");
  }

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await fetchWithRetry(url, {
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

// Llamada NO streaming, para tareas de "traducir a datos estructurados" (no
// conversación) — usa responseMimeType/responseSchema para forzar que Gemini
// devuelva JSON válido según el esquema, en vez de tener que parsear texto
// libre a la fuerza.
export async function generateGeminiJson({ model, systemInstruction, prompt, schema, timeoutMs }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada en el servidor.");
  }

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        ...(schema ? { responseSchema: schema } : {}),
      },
    }),
  }, timeoutMs);

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      // ignore
    }
    throw new Error(`Gemini API respondió ${res.status}. ${detail}`);
  }

  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini no devolvió un JSON válido.");
  }
}
