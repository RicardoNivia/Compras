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

// Línea de tiempo de alto nivel de un registro (ver RecordTimelineModal.jsx)
// — visible para cualquier rol, a diferencia de la sección Auditoría completa.
export async function fetchRecordTimelineApi(id) {
  const res = await fetch(`/api/records/${id}/timeline`, { cache: "no-store" });
  return handle(res);
}

// Lectura de facturas con Nova (ver InvoiceScanner.jsx) — "imageBase64" sin
// el prefijo "data:...;base64,". Nunca guarda nada, solo propone campos.
export async function invoiceExtractApi({ imageBase64, mimeType }) {
  const res = await fetch("/api/agent/invoice-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });
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

// Calificación del proveedor para un registro (ver RatingModal.jsx) — estilo
// Uber/Rappi: 1 a 5 estrellas, causas obligatorias si es menor a 5.
export async function fetchCalificacionApi(recordId) {
  const res = await fetch(`/api/records/${recordId}/calificacion`, { cache: "no-store" });
  return handle(res);
}

export async function saveCalificacionApi(recordId, data) {
  const res = await fetch(`/api/records/${recordId}/calificacion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
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

export async function fetchUsuariosDisponiblesApi() {
  const res = await fetch("/api/maestros/usuarios-disponibles", { cache: "no-store" });
  return handle(res);
}

// ---------- Proveedores (módulo de ciclo anual) ----------

async function jsonFetch(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return handle(res);
}

function queryString(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => { if (x) qs.append(k, String(x)); });
    else if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// Catálogo plano (autocompletar de Registros). Incluye la alerta del ciclo.
export async function fetchProveedores(onlyActive, search) {
  return jsonFetch(`/api/proveedores${queryString({ onlyActive: onlyActive ? "1" : "", search })}`, "GET");
}

// El NIT es la llave primaria del proveedor: todas las rutas van por NIT.
const rutaProveedor = (nit) => `/api/proveedores/${encodeURIComponent(nit)}`;

export async function fetchProveedorDetalle(nit) {
  return jsonFetch(rutaProveedor(nit), "GET");
}

export async function createProveedorApi(data) {
  return jsonFetch("/api/proveedores", "POST", data);
}

export async function updateProveedorApi(nit, data) {
  return jsonFetch(rutaProveedor(nit), "PATCH", data);
}

export async function deleteProveedorApi(nit) {
  return jsonFetch(rutaProveedor(nit), "DELETE");
}

// Validación en tiempo real: { nit, valido, existe, proveedor: { nit, nombre, activo } | null }.
// "excluir" es el NIT actual cuando se está editando (no cuenta como duplicado).
export async function verificarNitApi(nit, excluir) {
  return jsonFetch(`/api/proveedores/verificar-nit${queryString({ nit, excluir })}`, "GET");
}

export async function fetchMaestroProveedores(filters = {}) {
  return jsonFetch(`/api/proveedores/maestro${queryString(filters)}`, "GET");
}

export async function fetchIndicadoresProveedores() {
  return jsonFetch("/api/proveedores/indicadores", "GET");
}

export async function fetchInformeMensual(anio, mes) {
  return jsonFetch(`/api/proveedores/informe${queryString({ anio, mes })}`, "GET");
}

// Acción sobre varios proveedores: { ids, tipo: "checklist", cumple } o { ids, tipo: "estado", estado }.
export async function accionMasivaProveedoresApi(body) {
  return jsonFetch("/api/proveedores/masivo", "PATCH", body);
}

// Análisis con IA del ciclo de proveedores: { resumen, alertas: [{ nivel, texto }], notificaciones, sugerencias }.
export async function reviewProveedoresApi() {
  return jsonFetch("/api/agent/review-proveedores", "POST");
}

// Análisis con IA del Informe mensual de proveedores del mes indicado (mismo formato que reviewProveedoresApi).
export async function reviewInformeProveedoresApi(anio, mes) {
  return jsonFetch("/api/agent/review-informe-proveedores", "POST", { anio, mes });
}

export async function fetchAlertasProveedores() {
  return jsonFetch("/api/proveedores/alertas", "GET");
}

export async function fetchConfigProveedores() {
  return jsonFetch("/api/proveedores/config", "GET");
}

export async function updateConfigProveedoresApi(data) {
  return jsonFetch("/api/proveedores/config", "PUT", data);
}

export async function cambiarEstadoCicloApi(nit, estado, fechaActualizacion) {
  return jsonFetch(`${rutaProveedor(nit)}/ciclo/estado`, "PATCH", { estado, fechaActualizacion });
}

export async function setDocumentoCicloApi(nit, clave, cumple) {
  return jsonFetch(`${rutaProveedor(nit)}/ciclo/documentos`, "PATCH", { clave, cumple });
}

export async function cambiarClasificacionApi(nit, data) {
  return jsonFetch(`${rutaProveedor(nit)}/clasificacion`, "PATCH", data);
}

// Búsqueda en lenguaje natural (Nova) para cualquier tabla de proveedores.
export async function directorioSearchFiltersWithAiApi(query, options) {
  return jsonFetch("/api/agent/proveedor-search-filters", "POST", { query, options });
}

export async function parseProveedorTextoApi(texto) {
  const res = await fetch("/api/agent/proveedor-parse-texto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texto }),
  });
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
export async function sendAgentChatApi({ message, conversationId, section, widget, contexto }) {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId, section, widget, contexto }),
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

export async function auditSearchFiltersWithAiApi(query, options) {
  const res = await fetch("/api/agent/audit-search-filters", {
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

// ---------- Mi día y alertas (ver MiDiaView.jsx) ----------

// "Mi día y alertas": lo que le toca hoy al usuario según su rol (ver backend/lib/pendientes.js).
// Nova resume el día del usuario: { resumen, prioridades: string[], consejo }.
export async function reviewPendientesApi() {
  const res = await fetch("/api/agent/review-pendientes", { method: "POST" });
  return handle(res);
}

// ---------- Estudio de informes (ver components/informes/*) ----------

export async function fetchReportsApi() {
  return jsonFetch("/api/reports", "GET");
}

export async function fetchReportApi(id) {
  return jsonFetch(`/api/reports/${id}`, "GET");
}

// La generación con IA puede tardar más de lo que el proxy de rewrites deja esperar en una sola llamada. El backend
// arranca un trabajo en segundo plano y devuelve su id; esta función hace el polling (GETs cortos) para que quien la
// llama la vea como una promesa normal. "jobsPath" cambia por feature (el chat de Nova usa /api/agent/chat/jobs).
async function pollJob(jobId, { jobsPath = "/api/reports/jobs", maxWaitMs = 115000, intervalMs = 1500 } = {}) {
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

async function jobFetch(url, body, opts) {
  const { jobId } = await jsonFetch(url, "POST", body || {});
  return pollJob(jobId, opts);
}

export async function fetchPlantillasApi() {
  return jsonFetch("/api/reports/plantillas", "GET");
}

// Contenido del informe tal como quedaría hoy (sin guardar nada). soloContenido: el editor lo dibuja en pantalla y
// pide el PDF aparte solo al abrir la vista previa.
export async function previewEstudioApi(informe, { soloContenido = true } = {}) {
  return jobFetch("/api/reports/preview", { ...informe, tipo: "estudio", soloContenido });
}

// Vuelve a dibujar el PDF a partir de un contenido ya generado: sin IA, responde al instante.
export async function renderReportPdfApi({ content, ...informe }) {
  return jsonFetch("/api/reports/render-pdf", "POST", { ...informe, content, tipo: "estudio" });
}

// Nova: "armar" (desde el pedido), "editar" (cambio en lenguaje natural), "programacion" (frase → regla), "mensaje".
export async function novaInformeApi(accion, body) {
  return jobFetch(`/api/reports/nova/${accion}`, body, { maxWaitMs: 120000 });
}

export async function proximasFechasApi(regla) {
  return jsonFetch("/api/reports/proximas-fechas", "POST", regla);
}

export async function cifraDetalleApi(params) {
  return jsonFetch("/api/reports/cifra", "POST", params);
}

export async function createReportApi(data) {
  return jsonFetch("/api/reports", "POST", data);
}

export async function updateReportApi(id, data) {
  return jsonFetch(`/api/reports/${id}`, "PATCH", data);
}

export async function deleteReportApi(id) {
  return jsonFetch(`/api/reports/${id}`, "DELETE");
}

export async function fetchEdicionesApi(reportId) {
  return jsonFetch(`/api/reports/${reportId}/ediciones`, "GET");
}

// origen "manual" (Generar ahora) o "prueba" (solo para quien la pide).
export async function generarEdicionApi(reportId, origen = "manual") {
  return jobFetch(`/api/reports/${reportId}/ediciones`, { origen }, { maxWaitMs: 150000 });
}

export async function fetchEdicionApi(edId) {
  return jsonFetch(`/api/reports/ediciones/${edId}`, "GET");
}

export function edicionPdfUrl(edId, { inline = false } = {}) {
  return `/api/reports/ediciones/${edId}/pdf${inline ? "?inline=1" : ""}`;
}

export async function marcarEdicionEnviadaApi(edId) {
  return jsonFetch(`/api/reports/ediciones/${edId}/enviado`, "POST");
}

export async function fetchPorEnviarApi() {
  return jsonFetch("/api/reports/por-enviar", "GET");
}

// Informes solo para consultar (menú "Ver informes"): no requieren el permiso de Informes, solo tener acceso.
export async function fetchCompartidosApi() {
  return jsonFetch("/api/reports/compartidos", "GET");
}

export async function fetchCompartidoApi(id) {
  return jsonFetch(`/api/reports/compartidos/${id}`, "GET");
}

export async function contenidoCompartidoApi(id) {
  return jobFetch(`/api/reports/compartidos/${id}`, {}, { maxWaitMs: 120000 });
}

export async function fetchUsuariosInformesApi() {
  return jsonFetch("/api/reports/usuarios", "GET");
}

export async function fetchEdicionContenidoApi(edId) {
  return jsonFetch(`/api/reports/ediciones/${edId}/contenido`, "GET");
}

export async function fetchActividadInformeApi(reportId) {
  return jsonFetch(`/api/reports/${reportId}/actividad`, "GET");
}

// ---------- Valoración con IA de compras radicadas ----------

// null si la compra aún no se ha valorado.
export async function getValoracionApi(recordId) {
  const { valoracion } = await jsonFetch(`/api/records/${recordId}/valoracion`, "GET");
  return valoracion;
}

// Genera (o vuelve a generar) con IA la valoración de una compra ya radicada y la guarda.
export async function generarValoracionApi(recordId) {
  const { valoracion } = await jsonFetch(`/api/records/${recordId}/valoracion`, "POST");
  return valoracion;
}

// Historial de compras de un proveedor con su valoración y la calificación general.
export async function fetchComprasProveedorApi(nit) {
  return jsonFetch(`/api/proveedores/${encodeURIComponent(nit)}/compras`, "GET");
}

// ---------- Bienestar: actividades del cronograma (ver backend/lib/actividadesBienestar.js) ----------

export async function fetchActividadesApi(anio) {
  const res = await fetch(`/api/actividades${anio ? `?anio=${encodeURIComponent(anio)}` : ""}`, { cache: "no-store" });
  return handle(res);
}

export const fetchComprasSinActividadApi = (anio, mes) => fetch(`/api/actividades/compras-sin-actividad?anio=${encodeURIComponent(anio)}${mes ? `&mes=${mes}` : ""}`, { cache: "no-store" }).then(handle);

export async function fetchActividadApi(id) {
  const res = await fetch(`/api/actividades/${id}`, { cache: "no-store" });
  return handle(res);
}

export async function createActividadApi(data) {
  const res = await fetch("/api/actividades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateActividadApi(id, data) {
  const res = await fetch(`/api/actividades/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteActividadApi(id) {
  const res = await fetch(`/api/actividades/${id}`, { method: "DELETE" });
  return handle(res);
}

export async function fetchResumenBienestarApi(anio, linea = "Bienestar", mes = null) {
  const res = await fetch(`/api/actividades/resumen?anio=${encodeURIComponent(anio)}&linea=${encodeURIComponent(linea)}${mes ? `&mes=${mes}` : ""}`, { cache: "no-store" });
  return handle(res);
}

export async function fetchComprasDisponiblesApi(q) {
  const res = await fetch(`/api/actividades/compras-disponibles?q=${encodeURIComponent(q || "")}`, { cache: "no-store" });
  return handle(res);
}

export async function asociarCompraApi(actividadId, recordId) {
  const res = await fetch(`/api/actividades/${actividadId}/compras`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recordId }),
  });
  return handle(res);
}

export async function desasociarCompraApi(actividadId, recordId) {
  const res = await fetch(`/api/actividades/${actividadId}/compras?recordId=${encodeURIComponent(recordId)}`, { method: "DELETE" });
  return handle(res);
}

// ---------- Roles personalizados (Usuarios › Roles) ----------

export async function fetchRolesApi() {
  const res = await fetch("/api/roles", { cache: "no-store" });
  return handle(res);
}

export async function createRolApi(data) {
  const res = await fetch("/api/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateRolApi(clave, data) {
  const res = await fetch(`/api/roles/${encodeURIComponent(clave)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteRolApi(clave) {
  const res = await fetch(`/api/roles/${encodeURIComponent(clave)}`, { method: "DELETE" });
  return handle(res);
}

// ---------- Bienestar: participantes, inventario, formulario público ----------

const jsonPost = (url, method, data) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(handle);

export const fetchParticipantesApi = (actividadId) => fetch(`/api/actividades/${actividadId}/participantes`, { cache: "no-store" }).then(handle);
export const crearParticipanteApi = (actividadId, data) => jsonPost(`/api/actividades/${actividadId}/participantes`, "POST", data);
export const actualizarParticipanteApi = (actividadId, id, data) => jsonPost(`/api/actividades/${actividadId}/participantes/${id}`, "PUT", data);
export const eliminarParticipanteApi = (actividadId, id) => fetch(`/api/actividades/${actividadId}/participantes/${id}`, { method: "DELETE" }).then(handle);

export function importarParticipantesApi(actividadId, archivo, { modo = "inscripcion", noMarcadosNoAsistieron = false } = {}) {
  const fd = new FormData();
  fd.append("archivo", archivo);
  fd.append("modo", modo);
  if (noMarcadosNoAsistieron) fd.append("noMarcadosNoAsistieron", "1");
  return fetch(`/api/actividades/${actividadId}/participantes/importar`, { method: "POST", body: fd }).then(handle);
}

// Excel con Nova: sin confirmar devuelve la vista previa (no escribe nada); al confirmar se reenvía con su mapeo.
export function importarConNovaApi(actividadId, archivo, { tipo, mapeo, noMarcadosNoAsistieron = false, confirmar = false }) {
  const fd = new FormData();
  fd.append("archivo", archivo);
  fd.append("tipo", tipo);
  if (mapeo) fd.append("mapeo", JSON.stringify(mapeo));
  if (noMarcadosNoAsistieron) fd.append("noMarcadosNoAsistieron", "1");
  if (confirmar) fd.append("confirmar", "1");
  return fetch(`/api/actividades/${actividadId}/participantes/importar-nova`, { method: "POST", body: fd }).then(handle);
}

export const generarAnalisisActividadApi = (actividadId, origen = "manual") => jsonPost(`/api/actividades/${actividadId}/analisis`, "POST", { origen });
export const fetchSolicitudesActividadApi = (actividadId) => fetch(`/api/actividades/${actividadId}/solicitudes`, { cache: "no-store" }).then(handle);
export const crearSolicitudCompraApi = (actividadId, data) => jsonPost(`/api/actividades/${actividadId}/solicitudes`, "POST", data);
export const cancelarSolicitudCompraApi = (actividadId, id) => fetch(`/api/actividades/${actividadId}/solicitudes/${id}`, { method: "DELETE" }).then(handle);
export const generarCompraDeSolicitudApi = (id, data) => jsonPost(`/api/solicitudes-compra/${id}/generar`, "POST", data);
export const rechazarSolicitudApi = (id, motivo) => jsonPost(`/api/solicitudes-compra/${id}/rechazar`, "POST", { motivo });
export const explicarIndicadorBienestarApi = (data) => jsonPost("/api/actividades/explicar", "POST", data);
export const fetchAgenteEvaluacionApi = () => fetch("/api/actividades/agente-evaluacion", { cache: "no-store" }).then(handle);
export const fetchEstadoAgenteEvaluacionApi = () => fetch("/api/actividades/agente-evaluacion?estado=1", { cache: "no-store" }).then(handle);
export const iniciarAgenteEvaluacionApi = () => jsonPost("/api/actividades/agente-evaluacion", "POST", { confirmar: true });
export const detenerAgenteEvaluacionApi = () => fetch("/api/actividades/agente-evaluacion", { method: "DELETE" }).then(handle);
export const fetchMaestroTipoApi = (tipo) => fetch(`/api/maestros?tipo=${encodeURIComponent(tipo)}&onlyActive=1`, { cache: "no-store" }).then(handle);
export const fetchAnalisisBienestarApi = (linea, anio, mes = 0) => fetch(`/api/actividades/analisis?linea=${encodeURIComponent(linea)}&anio=${encodeURIComponent(anio)}&mes=${mes}`, { cache: "no-store" }).then(handle);
export const generarAnalisisBienestarApi = (data) => jsonPost("/api/actividades/analisis", "POST", data);

export const fetchObservacionesApi = (actividadId) => fetch(`/api/actividades/${actividadId}/observaciones`, { cache: "no-store" }).then(handle);
export const crearObservacionApi = (actividadId, data) => jsonPost(`/api/actividades/${actividadId}/observaciones`, "POST", data);
export const eliminarObservacionApi = (actividadId, id) => fetch(`/api/actividades/${actividadId}/observaciones/${id}`, { method: "DELETE" }).then(handle);

// Agente de importación: analizar no escribe nada; importar aplica el plan (con las respuestas) sin volver a llamar a Nova.
function agenteImportacion(actividadId, archivo, accion, plan) {
  const fd = new FormData();
  fd.append("archivo", archivo);
  fd.append("accion", accion);
  if (plan) fd.append("plan", JSON.stringify(plan));
  return fetch(`/api/actividades/${actividadId}/agente-importacion`, { method: "POST", body: fd }).then(handle);
}
export const analizarConAgenteApi = (actividadId, archivo, plan = null) => agenteImportacion(actividadId, archivo, "analizar", plan);
export const importarConAgenteApi = (actividadId, archivo, plan) => agenteImportacion(actividadId, archivo, "importar", plan);

export const fetchInventarioApi = (actividadId) => fetch(`/api/actividades/${actividadId}/inventario`, { cache: "no-store" }).then(handle);
export const crearItemApi = (actividadId, data) => jsonPost(`/api/actividades/${actividadId}/inventario`, "POST", data);
export const actualizarItemApi = (actividadId, id, data) => jsonPost(`/api/actividades/${actividadId}/inventario/${id}`, "PUT", data);
export const eliminarItemApi = (actividadId, id) => fetch(`/api/actividades/${actividadId}/inventario/${id}`, { method: "DELETE" }).then(handle);

export function importarInventarioApi(actividadId, archivo) {
  const fd = new FormData();
  fd.append("archivo", archivo);
  return fetch(`/api/actividades/${actividadId}/inventario/importar`, { method: "POST", body: fd }).then(handle);
}

export const fetchPlantillasFormularioApi = (actividadId) => fetch(`/api/actividades/${actividadId}/formulario`, { cache: "no-store" }).then(handle);
export const configurarFormularioApi = (actividadId, data) => jsonPost(`/api/actividades/${actividadId}/formulario`, "PUT", data);

export const fetchFormularioPublicoApi = (token) => fetch(`/api/publico/inscripcion/${encodeURIComponent(token)}`, { cache: "no-store" }).then(handle);
export const inscribirPublicoApi = (token, data) => jsonPost(`/api/publico/inscripcion/${encodeURIComponent(token)}`, "POST", data);

// ---------- Bienestar: fotos de las actividades ----------

// Salario mínimo (SMMLV) por año, en Maestros de Compras.
export const fetchSalariosMinimosApi = () => fetch("/api/maestros/salario-minimo", { cache: "no-store" }).then(handle);
export const guardarSalarioMinimoApi = (body) => fetch("/api/maestros/salario-minimo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(handle);
export const eliminarSalarioMinimoApi = (anio) => fetch(`/api/maestros/salario-minimo?anio=${encodeURIComponent(anio)}`, { method: "DELETE" }).then(handle);

// Agentes de compras de Bienestar (asociador, compras sugeridas y cotizador).
const postAgente = (url, body, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(handle);
export const fetchAsociadorApi = () => fetch("/api/actividades/agentes/asociador", { cache: "no-store" }).then(handle);
export const accionAsociadorApi = (accion, ids) => postAgente("/api/actividades/agentes/asociador", { accion, ids });
export const revisionDiariaAsociadorApi = (activo) => postAgente("/api/actividades/agentes/asociador", { accion: "revisionDiaria", activo });
export const sugerirComprasApi = (actividadId) => postAgente(`/api/actividades/${actividadId}/sugerir-compras`, {});
export const crearComprasSugeridasApi = (actividadId, items) => postAgente(`/api/actividades/${actividadId}/sugerir-compras`, { crear: true, items });
// El cotizador sirve a Bienestar y a Compras: base = ruta del módulo.
export const COTIZADOR_BIENESTAR = "/api/actividades/agentes/cotizador";
export const COTIZADOR_COMPRAS = "/api/agentes-compras/cotizador";
export const fetchCuadrosApi = (base = COTIZADOR_BIENESTAR) => fetch(base, { cache: "no-store" }).then(handle);
export function extraerCotizacionApi(archivo, base = COTIZADOR_BIENESTAR) {
  const fd = new FormData();
  fd.append("archivo", archivo, archivo.name);
  return fetch(`${base}/extraer`, { method: "POST", body: fd }).then(handle);
}
export const crearCuadroApi = (body, base = COTIZADOR_BIENESTAR) => postAgente(base, body);
export const eliminarCuadroApi = (id, base = COTIZADOR_BIENESTAR) => fetch(`${base}/${id}`, { method: "DELETE" }).then(handle);

// Agentes de Compras (página /agentes del módulo Compras).
export const revisarCompraApi = (borrador, id) => postAgente("/api/agentes-compras/revisar", { borrador, id });
export const proveedorPrecioApi = (texto) => postAgente("/api/agentes-compras/proveedor-precio", { texto });
export const buscarComprasAgenteApi = (q) => fetch(`/api/agentes-compras/compras?q=${encodeURIComponent(q || "")}`, { cache: "no-store" }).then(handle);
export function verificarFacturaApi(recordId, archivo) {
  const fd = new FormData();
  fd.append("recordId", recordId);
  fd.append("archivo", archivo, archivo.name);
  return fetch("/api/agentes-compras/factura", { method: "POST", body: fd }).then(handle);
}
export const vigiaPresupuestoApi = (anio) => fetch(`/api/agentes-compras/presupuesto?anio=${encodeURIComponent(anio)}`, { cache: "no-store" }).then(handle);
export const anomaliasApi = (desde, hasta) => fetch(`/api/agentes-compras/anomalias?desde=${encodeURIComponent(desde || "")}&hasta=${encodeURIComponent(hasta || "")}`, { cache: "no-store" }).then(handle);
export const lecturaNovaApi = (body) => postAgente("/api/agentes-compras/lectura", body);

export const fetchHistoriasApi = (anio) => fetch(`/api/actividades/historias?anio=${encodeURIComponent(anio)}`, { cache: "no-store" }).then(handle);
export const fetchFotosApi = (actividadId) => fetch(`/api/actividades/${actividadId}/fotos`, { cache: "no-store" }).then(handle);
export const urlFoto = (actividadId, fotoId, mini = false) => `/api/actividades/${actividadId}/fotos/${fotoId}${mini ? "?t=mini" : ""}`;
export const actualizarFotoApi = (actividadId, id, data) => jsonPost(`/api/actividades/${actividadId}/fotos/${id}`, "PUT", data);
export const eliminarFotoApi = (actividadId, id) => fetch(`/api/actividades/${actividadId}/fotos/${id}`, { method: "DELETE" }).then(handle);

export function subirFotoApi(actividadId, { imagen, miniatura, nombre, ancho, alto, descripcion }) {
  const fd = new FormData();
  fd.append("imagen", imagen, "imagen.jpg");
  fd.append("miniatura", miniatura, "miniatura.jpg");
  fd.append("nombre", nombre);
  fd.append("ancho", String(ancho));
  fd.append("alto", String(alto));
  if (descripcion) fd.append("descripcion", descripcion);
  return fetch(`/api/actividades/${actividadId}/fotos`, { method: "POST", body: fd }).then(handle);
}
