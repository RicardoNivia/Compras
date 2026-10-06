// Cliente de la API de registros (fetch al App Router).

async function handle(res) {
  if (!res.ok) {
    let message = `Error ${res.status}`;
    let extra = null;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      extra = data;
    } catch {
      // ignore
    }
    const err = new Error(message);
    if (extra) Object.assign(err, extra);
    throw err;
  }
  return res.json();
}

export async function fetchRecords() {
  const res = await fetch("/api/records", { cache: "no-store" });
  return handle(res);
}

export async function createRecordApi(data) {
  const res = await fetch("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateRecordApi(id, data) {
  const res = await fetch(`/api/records/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function patchRecordApi(id, partial) {
  const res = await fetch(`/api/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  return handle(res);
}

export async function deleteRecordApi(id) {
  const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
  return handle(res);
}

export async function changePasswordApi(currentPassword, newPassword) {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handle(res);
}

export async function fetchMaestros(tipo, onlyActive) {
  const qs = new URLSearchParams();
  if (tipo) qs.set("tipo", tipo);
  if (onlyActive) qs.set("onlyActive", "1");
  const suffix = qs.toString();
  const res = await fetch(`/api/maestros${suffix ? `?${suffix}` : ""}`, { cache: "no-store" });
  return handle(res);
}

export async function createMaestroApi(data) {
  const res = await fetch("/api/maestros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateMaestroApi(id, data) {
  const res = await fetch(`/api/maestros/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteMaestroApi(id) {
  const res = await fetch(`/api/maestros/${id}`, { method: "DELETE" });
  return handle(res);
}

export async function fetchPresupuestos(anio) {
  const qs = anio ? `?anio=${anio}` : "";
  const res = await fetch(`/api/presupuestos${qs}`, { cache: "no-store" });
  return handle(res);
}

export async function savePresupuestoApi(data) {
  const res = await fetch("/api/presupuestos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deletePresupuestoApi(id) {
  const res = await fetch(`/api/presupuestos/${id}`, { method: "DELETE" });
  return handle(res);
}

// requiresConfirm/afectados llegan en el error (ver handle) si el cambio de
// modo borraría presupuestos ya configurados y no se envió confirm:true.
export async function setModoAnioApi(anio, modo, confirm = false) {
  const res = await fetch("/api/presupuestos/modo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anio, modo, confirm }),
  });
  return handle(res);
}

export async function fetchPermissionsMatrix() {
  const res = await fetch("/api/permissions", { cache: "no-store" });
  return handle(res);
}

export async function setPermissionApi(role, feature, allowed) {
  const res = await fetch("/api/permissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, feature, allowed }),
  });
  return handle(res);
}

// Mensaje del chat del Agente IA (ver AgenteChat.jsx). Con "tool use" el
// modelo puede ir y volver varias veces pidiendo datos antes de responder, y
// la respuesta final pasa por una segunda capa de moderación — nada de eso
// se puede mostrar en vivo, así que el backend corre esto como trabajo en
// segundo plano (mismo patrón que Informes automáticos) en vez de streaming;
// aquí se hace polling hasta tener el texto final.
export async function sendAgentChatApi({ message, conversationId, section, widget }) {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId, section, widget }),
  });
  const { jobId, conversationId: newConversationId } = await handle(res);
  const result = await pollJob(jobId, { jobsPath: "/api/agent/chat/jobs" });
  return { text: result.text, conversationId: newConversationId };
}

// Traduce una búsqueda en lenguaje natural a los mismos filtros que usa el
// modo manual de Registros (ver RegistrosView.jsx) — con Anthropic, del lado
// del servidor.
export async function searchFiltersWithAiApi(query, options) {
  const res = await fetch("/api/agent/search-filters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, options }),
  });
  return handle(res);
}

// "Explícame este número" — explicación puntual en lenguaje natural de un KPI
// del Dashboard, a partir de los registros que lo componen (ver DashboardView.jsx).
export async function explainKpiApi({ label, value, comparisonLabel, comparisonValue, records }) {
  const res = await fetch("/api/agent/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, value, comparisonLabel, comparisonValue, records }),
  });
  return handle(res);
}

// "Revisar con IA" — evalúa si el texto de Observaciones justifica bien el
// estado de legalización actual, y sugiere una mejora si no (ver RecordModal.jsx).
export async function reviewObservacionesApi({ observaciones, estadoLegalizacion, descripcion, area, categoria, proveedor, valorConIva }) {
  const res = await fetch("/api/agent/review-observaciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ observaciones, estadoLegalizacion, descripcion, area, categoria, proveedor, valorConIva }),
  });
  return handle(res);
}

// ---------- Alertas y notificaciones (ver AlertasView.jsx) ----------

export async function fetchAlertsApi() {
  const res = await fetch("/api/alerts");
  return handle(res);
}

// "Revisar con IA" de la página de Alertas — análisis completo (resumen,
// riesgos, proyección, sugerencias) a partir de las listas ya calculadas por
// el servidor; no manda datos desde el cliente, el backend recalcula las
// listas por su cuenta para no confiar en lo que haya en pantalla.
export async function reviewAlertasApi() {
  const res = await fetch("/api/agent/review-alertas", { method: "POST" });
  return handle(res);
}

// ---------- Informes automáticos (ver InformesView.jsx) ----------

export async function fetchReportsApi() {
  const res = await fetch("/api/reports", { cache: "no-store" });
  return handle(res);
}

// La generación puede tardar hasta ~100s (Anthropic sobre cientos de
// registros, ver backend/lib/aiStructured.js) — más de lo que el
// proxy de rewrites deja esperar en una sola llamada. El backend arranca un
// trabajo en segundo plano y devuelve su id de inmediato; esta función hace
// el polling acá (varios GETs cortos y rápidos) para que quien la llama siga
// viéndola como una promesa normal que resuelve con el resultado final.
// "jobsPath" es la ruta de consulta de estado (distinta por feature: Informes
// automáticos usa /api/reports/jobs/[jobId], el chat del Agente IA usa
// /api/agent/chat/jobs/[jobId] — mismo patrón, mismo lib/reportJobs.js del lado del backend).
async function pollJob(jobId, { jobsPath = "/api/reports/jobs", maxWaitMs = 115000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${jobsPath}/${jobId}`, { cache: "no-store" });
    const data = await handle(res);
    if (data.status === "done") return data.result;
    if (data.status === "error") throw new Error(data.error || "No se pudo completar la operación.");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("La operación está tardando más de lo esperado. Intenta de nuevo en un momento.");
}

// Vuelve a dibujar el PDF a partir de un contenido ya generado (sin IA, sin
// polling — responde al instante) — se usa al abrir "Editar informe" para
// mostrar de nuevo el mismo PDF guardado la última vez.
export async function renderReportPdfApi({ content, nombre, tipo }) {
  const res = await fetch("/api/reports/render-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, nombre, tipo }),
  });
  return handle(res);
}

export async function previewReportApi({ prompt, bloques, nombre, prioridad, cuerpoHtml, periodoGeneral, tipo }) {
  const res = await fetch("/api/reports/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, bloques, nombre, prioridad, cuerpoHtml, periodoGeneral, tipo }),
  });
  const { jobId } = await handle(res);
  return pollJob(jobId);
}

// Botón "Armar informe automáticamente con IA" (ReportEditor.jsx) — sin
// prompt: la IA analiza los datos reales y propone una estructura de bloques
// {periodoSugerido, bloques: [{tipo, titulo, metrica?, agruparPor?, ...}]}.
export async function sugerirBloquesApi() {
  const res = await fetch("/api/reports/sugerir-bloques", { method: "POST" });
  const { jobId } = await handle(res);
  return pollJob(jobId);
}

// Botón "IA" del editor del cuerpo del correo (ReportBodyEditor.jsx) — no
// genera nada desde cero, revisa/reescribe el texto que el usuario ya
// escribió y devuelve {texto} para que decida si lo aplica.
export async function generateCuerpoCorreoIaApi({ texto }) {
  const res = await fetch("/api/reports/cuerpo-ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
  const { jobId } = await handle(res);
  return pollJob(jobId, { maxWaitMs: 60000 });
}

export async function createReportApi(data) {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateReportApi(id, data) {
  const res = await fetch(`/api/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteReportApi(id) {
  const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
  return handle(res);
}

export async function sendReportNowApi(id) {
  const res = await fetch(`/api/reports/${id}/send-now`, { method: "POST" });
  const { jobId } = await handle(res);
  return pollJob(jobId);
}
