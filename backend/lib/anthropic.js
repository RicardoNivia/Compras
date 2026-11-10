// El grupo de variables de producción en Azure DevOps ("compras-prod") tiene
// la variable mal escrita como ANTROPIC_API_KEY (sin "H") y no se puede
// corregir ahí — se acepta también ese nombre para no depender de que se
// arregle en Azure. ANTHROPIC_API_KEY (el nombre correcto) sigue teniendo
// prioridad si ambas estuvieran definidas.
function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTROPIC_API_KEY;
}

// Las claves de usuario (sk-ant-usr-…) no pertenecen a un workspace: Anthropic exige indicarlo en cada llamada.
// Solo se envía si se define ANTHROPIC_WORKSPACE_ID; con una clave de workspace (la normal del servidor) no hace falta.
function workspaceHeader() {
  const id = process.env.ANTHROPIC_WORKSPACE_ID;
  return id ? { "anthropic-workspace-id": id } : {};
}

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
// 4096 (y luego 8192) se quedaban cortos para informes con muchas secciones +
// tablas grandes: Anthropic cortaba la respuesta a mitad del JSON (stop_reason
// "max_tokens"), lo que fallaba al hacer JSON.parse con un mensaje confuso
// ("no devolvió un JSON válido") en vez de explicar la causa real. Subir este
// límite no tiene costo extra si no se usa — Anthropic solo cobra los tokens
// que realmente genera, "max_tokens" es solo un techo — así que se deja bien
// holgado (el modelo acepta hasta 64000 para claude-haiku-4-5).
const MAX_TOKENS = 32000;
// Un solo intento con timeout generoso (en vez de varios cortos) — debe
// fallar con margen antes de que el proxy
// de rewrites del frontend corte la conexión a los ~30s.
const MAX_CONNECT_RETRIES = 0;
const CONNECT_TIMEOUT_MS = 25000;
// Timeout por ronda del loop de "tool use" (ver runAnthropicAgentChat): a
// diferencia de streamAnthropicChat (SSE, el primer byte llega casi de
// inmediato), estas llamadas NO son streaming — Anthropic no manda nada hasta
// tener la respuesta completa. Para una pregunta que pide un análisis extenso
// (varios gráficos/tablas), generar la respuesta final puede tardar bastante
// más que CONNECT_TIMEOUT_MS; con ese límite corto, la llamada se abortaba a
// mitad de generación y el mensaje de error (que menciona "Anthropic" por
// diseño) terminaba disparando la moderación de infraestructura (ver
// agentModeration.js) en vez de mostrarse — no era un falso positivo de la
// moderación, era este timeout cortando la respuesta real antes de tiempo.
const AGENT_ROUND_TIMEOUT_MS = 120000;

async function fetchWithRetry(url, options, timeoutMs = CONNECT_TIMEOUT_MS) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      lastErr = err.name === "AbortError"
        ? new Error(`sin respuesta tras ${timeoutMs / 1000}s`)
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

// "contents" llega en el formato usado en toda la ruta de chat
// ({role: "user"|"model", parts:[{text}]}) — aquí se traduce al formato de
// mensajes de Anthropic.
// Marca el último mensaje como punto de caché ("prompt caching" incremental): en una pregunta del chat el modelo va y
// vuelve varias veces con herramientas, y cada vuelta reenvía toda la conversación. Con esta marca, lo ya enviado en la
// vuelta anterior se lee de la caché (~10 % del precio normal) en vez de cobrarse completo otra vez.
function conCacheEnUltimo(messages) {
  if (!messages.length) return messages;
  const out = messages.slice(0, -1);
  const ultimo = messages[messages.length - 1];
  const bloques = typeof ultimo.content === "string" ? [{ type: "text", text: ultimo.content || " " }] : ultimo.content.map((b) => ({ ...b }));
  bloques[bloques.length - 1] = { ...bloques[bloques.length - 1], cache_control: { type: "ephemeral" } };
  out.push({ ...ultimo, content: bloques });
  return out;
}

// Un resultado de herramienta enorme (cientos de registros o movimientos) se cobra en cada vuelta siguiente: se recorta
// y se le avisa al modelo para que pida algo más específico.
const MAX_TOOL_RESULT_CHARS = 15000;
function recortarResultado(result) {
  const s = JSON.stringify(result);
  if (s.length <= MAX_TOOL_RESULT_CHARS) return s;
  return `${s.slice(0, MAX_TOOL_RESULT_CHARS)}… [resultado recortado por tamaño: si necesitas más detalle, vuelve a consultar con filtros más específicos o un límite menor]`;
}

function toAnthropicMessages(contents) {
  return contents.map((c) => ({
    role: c.role === "model" ? "assistant" : "user",
    content: (c.parts || []).map((p) => p.text || "").join(""),
  }));
}

// Llama a la Messages API de Anthropic en modo streaming (SSE) y va
// entregando (yield) cada fragmento de texto a medida que llega.
// "cacheableSystemPrefix" (opcional): parte del system prompt idéntica entre
// llamadas (ver aiChatCascade.js) — se manda como bloque de contenido propio
// con cache_control "ephemeral" para que Anthropic la reutilice en vez de
// reprocesarla en cada mensaje (ahorra tiempo y costo en prompts grandes con
// mucho texto fijo, como el dataset+procedimiento+guía del Agente IA).
export async function* streamAnthropicChat({ model, systemInstruction, contents, cacheableSystemPrefix }) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no está configurada en el servidor.");
  }

  const system = cacheableSystemPrefix
    ? [
        { type: "text", text: cacheableSystemPrefix, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: systemInstruction },
      ]
    : systemInstruction;

  const res = await fetchWithRetry(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...workspaceHeader(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: conCacheEnUltimo(toAnthropicMessages(contents)),
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
    // El detalle crudo de la respuesta de Anthropic solo se loguea server-side
    // (puede incluir parámetros de la petición saliente) — al cliente final
    // solo le llega el status.
    console.error(`Anthropic API respondió ${res.status}.`, detail);
    throw Object.assign(new Error(`Error al conectar con el servicio de IA (${res.status}).`), { status: res.status, detalle: detail });
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

// Llama a la Messages API de Anthropic con "tool use" (function calling): el
// modelo puede pedir ejecutar una o varias herramientas (ver lib/agentTools.js)
// antes de responder, en vez de recibir todos los datos de una sola vez en el
// system prompt. Hace el ciclo completo (llamar → ejecutar herramientas →
// volver a llamar con los resultados) hasta que el modelo responde en texto
// normal o se alcanza "maxRounds", y devuelve el texto final acumulado (no es
// streaming real: con tool use no hay texto definitivo que mostrar hasta que
// termina de decidir qué herramientas necesita, igual que ya pasaba antes con
// la moderación posterior — ver el comentario en app/api/agent/chat/route.js).
export async function runAnthropicAgentChat({ model, systemInstruction, contents, cacheableSystemPrefix, tools, executeTool, maxRounds = 8 }) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no está configurada en el servidor.");
  }

  const system = cacheableSystemPrefix
    ? [
        { type: "text", text: cacheableSystemPrefix, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: systemInstruction },
      ]
    : systemInstruction;

  const messages = toAnthropicMessages(contents);
  const textChunks = [];

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetchWithRetry(`${ANTHROPIC_API_BASE}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...workspaceHeader(),
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: conCacheEnUltimo(messages),
        tools,
      }),
    }, AGENT_ROUND_TIMEOUT_MS);

    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 400);
      } catch {
        // ignore
      }
      console.error(`Anthropic API respondió ${res.status}.`, detail);
      throw Object.assign(new Error(`Error al conectar con el servicio de IA (${res.status}).`), { status: res.status, detalle: detail });
    }

    const data = await res.json();
    if (process.env.AI_USAGE_LOG === "1") console.log("[ia-uso]", JSON.stringify(data?.usage || {})); // diagnóstico de consumo, solo si se activa
    const content = data?.content || [];
    const toolUseBlocks = content.filter((b) => b.type === "tool_use");
    const textBlocks = content.filter((b) => b.type === "text" && b.text);
    for (const b of textBlocks) textChunks.push(b.text);

    if (data?.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      return textChunks.join("\n\n");
    }

    messages.push({ role: "assistant", content });
    const toolResults = [];
    for (const block of toolUseBlocks) {
      let result;
      try {
        result = await executeTool(block.name, block.input);
      } catch (err) {
        result = { error: err.message || "Error ejecutando la herramienta." };
      }
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: recortarResultado(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (textChunks.length) return textChunks.join("\n\n");
  throw new Error("El agente alcanzó el máximo de consultas a herramientas sin poder generar una respuesta.");
}

// Anthropic no tiene un modo "responseSchema" nativo. El patrón de forzar una
// tool con tool_choice:{type:"tool"} NO es compatible con todos los modelos
// (p.ej. Haiku 4.5 responde 400 "tool_choice: type \"tool\" ... are not
// supported for this model") — así que en su lugar se le pide el JSON por
// instrucción directa en el system prompt y se parsea el texto de respuesta,
// igual de confiable en la práctica con modelos Claude recientes y sin esa
// restricción de compatibilidad. "schema" llega en formato
// (type: "OBJECT"/"STRING"/..., nullable) — se incluye tal cual en la
// instrucción, no hace falta traducirlo a JSON Schema.
function stripCodeFence(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

// "image" (opcional): { base64, mediaType } — adjunta una imagen al mensaje
// (lectura de facturas con visión, ver app/api/agent/invoice-extract/route.js)
// antes del texto del prompt, en vez de solo texto. "documento" (opcional): { base64, mediaType: "application/pdf" }
// — adjunta un PDF (cotizaciones del agente cotizador, ver lib/agenteCotizador.js).
export async function generateAnthropicJson({ model, systemInstruction, prompt, schema, image, documento, timeoutMs }) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no está configurada en el servidor.");
  }

  const jsonInstruction = schema
    ? `\n\nResponde ÚNICAMENTE con un objeto JSON válido que cumpla exactamente este esquema — sin texto adicional, sin explicaciones, sin bloques de código ni backticks (tipos: OBJECT/STRING/NUMBER/BOOLEAN/ARRAY; "nullable": true significa que el campo puede ir en null): ${JSON.stringify(schema)}`
    : "";

  const adjunto = image
    ? { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } }
    : documento
      ? { type: "document", source: { type: "base64", media_type: documento.mediaType, data: documento.base64 } }
      : null;
  const userContent = adjunto ? [adjunto, { type: "text", text: prompt }] : prompt;

  const res = await fetchWithRetry(`${ANTHROPIC_API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...workspaceHeader(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      // temperature 0: esta función solo la usa lib/aiStructured.js (Informes
      // automáticos, moderación, etc.) — mismo prompt siempre debe devolver el
      // mismo resultado. No afecta el chat del Agente IA, que usa
      // streamAnthropicChat.
      temperature: 0,
      system: `${systemInstruction}${jsonInstruction}`,
      messages: [{ role: "user", content: userContent }],
    }),
  }, timeoutMs);

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      // ignore
    }
    console.error(`Anthropic API respondió ${res.status}.`, detail);
    throw Object.assign(new Error(`Error al conectar con el servicio de IA (${res.status}).`), { status: res.status, detalle: detail });
  }

  const data = await res.json();
    if (process.env.AI_USAGE_LOG === "1") console.log("[ia-uso]", JSON.stringify(data?.usage || {})); // diagnóstico de consumo, solo si se activa
  const text = (data?.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
  if (data?.stop_reason === "max_tokens") {
    throw new Error(`Anthropic cortó la respuesta por ser demasiado larga (límite de ${MAX_TOKENS} tokens) — intenta con un prompt más acotado (menos secciones/tablas a la vez).`);
  }
  try {
    return JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("Anthropic no devolvió un JSON válido.");
  }
}
