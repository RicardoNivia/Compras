// Conexión con el correo de Microsoft 365 por Microsoft Graph (OAuth 2.0, flujo de código de autorización, permisos
// delegados de SOLO LECTURA). Configuración para TI: docs/correo-agente-proveedores.md.
//
// CORREO_MODO: "desactivado" (por defecto) | "simulado" (sin Microsoft: se prueba pegando un correo en Mi correo) | "real".
// "real" necesita MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET y MS_GRAPH_TENANT_ID; si falta alguno, queda desactivado.
// El secreto del cliente y los tokens nunca se devuelven al cliente ni se escriben en logs o auditoría.

const TIMEOUT_MS = 20000;
export const SCOPES = "offline_access openid email User.Read Mail.Read";

export function modoCorreo() {
  const modo = String(process.env.CORREO_MODO || "desactivado").trim().toLowerCase();
  if (modo === "real" && !(process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET && process.env.MS_GRAPH_TENANT_ID)) return "desactivado";
  return ["real", "simulado"].includes(modo) ? modo : "desactivado";
}

export function appUrl() {
  return String(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

const redirectUri = () => process.env.MS_GRAPH_REDIRECT_URI || `${appUrl()}/api/correo/callback`;
const autoridad = () => `https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_GRAPH_TENANT_ID)}/oauth2/v2.0`;

function errorGraph(mensaje, status) {
  return Object.assign(new Error(mensaje), { status: status === 401 || status === 400 ? 400 : 502, graphStatus: status });
}

async function conTiempo(url, opciones = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal });
  } catch (e) {
    throw errorGraph(e.name === "AbortError" ? "Microsoft no respondió a tiempo." : "No se pudo conectar con Microsoft.", 0);
  } finally {
    clearTimeout(t);
  }
}

// URL a la que se manda a la persona para que inicie sesión y autorice la lectura de su correo.
export function urlAutorizacion({ state, loginHint }) {
  const p = new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${autoridad()}/authorize?${p}`;
}

async function pedirToken(params) {
  const res = await conTiempo(`${autoridad()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_GRAPH_CLIENT_ID,
      client_secret: process.env.MS_GRAPH_CLIENT_SECRET,
      scope: SCOPES,
      redirect_uri: redirectUri(),
      ...params,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    // invalid_grant = el permiso se revocó o venció: hay que volver a vincular.
    const msg = data.error === "invalid_grant"
      ? "Microsoft ya no acepta la autorización (se revocó, cambió la contraseña o venció). Vuelve a vincular tu correo."
      : `Microsoft rechazó la autorización (${data.error || res.status}).`;
    throw errorGraph(msg, res.status);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiraAt: new Date(Date.now() + (Number(data.expires_in || 3600) - 120) * 1000),
  };
}

export const canjearCodigo = (code) => pedirToken({ grant_type: "authorization_code", code });
export const refrescarToken = (refreshToken) => pedirToken({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function graphGet(accessToken, rutaOUrl, { textoPlano = false } = {}) {
  const url = rutaOUrl.startsWith("https://") ? rutaOUrl : `https://graph.microsoft.com/v1.0${rutaOUrl}`;
  if (!url.startsWith("https://graph.microsoft.com/")) throw errorGraph("Dirección de Graph no permitida.", 0);
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (textoPlano) headers.Prefer = 'outlook.body-content-type="text"';
  const res = await conTiempo(url, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw errorGraph(`Microsoft Graph respondió ${res.status}${data?.error?.code ? ` (${data.error.code})` : ""}.`, res.status);
  }
  return res.json();
}

// Buzón de la persona que inició sesión (para comprobar que es el suyo).
export async function miBuzon(accessToken) {
  const me = await graphGet(accessToken, "/me?$select=displayName,mail,userPrincipalName");
  return { nombre: me.displayName || "", email: String(me.mail || me.userPrincipalName || "").toLowerCase() };
}

// Correos de la Bandeja de entrada recibidos desde `desde` (más antiguos primero), hasta `max`.
export async function mensajesDesde(accessToken, desde, max = 200) {
  const filtro = `receivedDateTime ge ${new Date(desde).toISOString()}`;
  let url = `/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filtro)}&$orderby=receivedDateTime asc&$top=50`
    + "&$select=id,subject,from,receivedDateTime,body,hasAttachments,webLink";
  const out = [];
  while (url && out.length < max) {
    const r = await graphGet(accessToken, url, { textoPlano: true });
    out.push(...(r.value || []));
    url = r["@odata.nextLink"] || null;
  }
  return out.slice(0, max);
}

// Adjuntos (solo metadatos) y el contenido de uno.
export async function adjuntosDe(accessToken, mensajeId) {
  const r = await graphGet(accessToken, `/me/messages/${encodeURIComponent(mensajeId)}/attachments?$select=id,name,contentType,size,isInline`);
  return (r.value || []).filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && !a.isInline);
}

export async function contenidoAdjunto(accessToken, mensajeId, adjuntoId) {
  const a = await graphGet(accessToken, `/me/messages/${encodeURIComponent(mensajeId)}/attachments/${encodeURIComponent(adjuntoId)}`);
  return a.contentBytes ? Buffer.from(a.contentBytes, "base64") : null;
}
