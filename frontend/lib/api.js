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

// Traduce una búsqueda en lenguaje natural a los mismos filtros que usa el
// modo manual de Registros (ver RegistrosView.jsx) — siempre con el modelo
// gratis de Gemini por defecto, del lado del servidor.
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

// ---------- Informes automáticos (ver InformesView.jsx) ----------

export async function fetchReportsApi() {
  const res = await fetch("/api/reports", { cache: "no-store" });
  return handle(res);
}

// La generación puede tardar hasta ~100s (fallback Gemini→Anthropic sobre
// cientos de registros, ver backend/lib/aiStructured.js) — más de lo que el
// proxy de rewrites deja esperar en una sola llamada. El backend arranca un
// trabajo en segundo plano y devuelve su id de inmediato; esta función hace
// el polling acá (varios GETs cortos y rápidos) para que quien la llama siga
// viéndola como una promesa normal que resuelve con el resultado final.
async function pollReportJob(jobId, { maxWaitMs = 115000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const res = await fetch(`/api/reports/jobs/${jobId}`, { cache: "no-store" });
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
export async function renderReportPdfApi({ content, nombre }) {
  const res = await fetch("/api/reports/render-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, nombre }),
  });
  return handle(res);
}

export async function previewReportApi({ prompt, nombre, prioridad, cuerpoModo, cuerpoPrompt }) {
  const res = await fetch("/api/reports/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, nombre, prioridad, cuerpoModo, cuerpoPrompt }),
  });
  const { jobId } = await handle(res);
  return pollReportJob(jobId);
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
  return pollReportJob(jobId);
}
