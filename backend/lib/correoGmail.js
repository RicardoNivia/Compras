import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// Lectura del Gmail de solicitudes (buzón compartido) por IMAP, en SOLO LECTURA (la Bandeja se abre con EXAMINE: no se
// marcan como leídos, no se mueven ni se borran). Se entra con una contraseña de aplicación de Google (cuenta con
// verificación en dos pasos › Contraseñas de aplicación), no con la contraseña normal. Ver docs/correo-agente-proveedores.md.
//
// Se omite lo que Gmail clasifica como Promociones (búsqueda X-GM-RAW). Los anuncios masivos que caen en otra pestaña
// los descarta el código (lib/buzonCompartido.js#esAnuncio).

const HOST = "imap.gmail.com";
const MAX_FUENTE = 25 * 1024 * 1024; // un correo más grande no se descarga
const SIN_PROMOCIONES = "-category:promotions";

function errorGmail(e) {
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|Application-specific password/i.test(`${e?.responseText || ""} ${e?.message || ""}`)) {
    return Object.assign(new Error("Gmail rechazó el correo o la contraseña de aplicación. Revisa que la cuenta tenga la verificación en dos pasos y que uses una contraseña de aplicación (16 letras), no la contraseña normal."), { status: 400, credenciales: true });
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|timeout/i.test(`${e?.code || ""} ${e?.message || ""}`)) {
    return Object.assign(new Error("No se pudo conectar con Gmail (imap.gmail.com). Revisa la conexión a internet del servidor."), { status: 502 });
  }
  return Object.assign(new Error(`Gmail respondió con un error: ${e?.responseText || e?.message || "desconocido"}`), { status: 502 });
}

async function conBuzon(email, clave, fn) {
  const client = new ImapFlow({
    host: HOST, port: 993, secure: true,
    auth: { user: email, pass: String(clave || "").replace(/\s+/g, "") },
    logger: false, connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 120000,
  });
  client.on("error", () => {}); // un corte del socket no tumba el proceso; la operación en curso ya falla sola
  try {
    await client.connect();
  } catch (e) {
    throw errorGmail(e);
  }
  try {
    const caja = await client.mailboxOpen("INBOX", { readOnly: true });
    return await fn(client, caja);
  } catch (e) {
    throw e.status ? e : errorGmail(e);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

// Comprueba el correo y la contraseña de aplicación. Devuelve cuántos correos hay en la Bandeja y su UIDVALIDITY.
export function probarGmail(email, clave) {
  return conBuzon(email, clave, async (_c, caja) => ({ mensajes: caja.exists, uidValidity: String(caja.uidValidity), siguienteUid: Number(caja.uidNext) }));
}

// Correos nuevos de la Bandeja de entrada (sin Promociones), más antiguos primero.
// - Con `ultimoUid` (y el mismo UIDVALIDITY) trae los de UID mayor.
// - Si no hay UID guardado o cambió el UIDVALIDITY, trae los recibidos desde `desde`.
// Devuelve { uidValidity, mensajes: [{ uid, mensajeId, messageId, asunto, remitente, recibidoAt, texto, encabezados, adjuntos: [{ nombre, tipoMime, tamano, contenido, inline }] }] }.
export function mensajesNuevosGmail(email, clave, { uidValidity, ultimoUid, desde, max = 50 }) {
  return conBuzon(email, clave, async (client, caja) => {
    const validez = String(caja.uidValidity);
    const porUid = ultimoUid != null && uidValidity === validez;
    const criterio = porUid
      ? { uid: `${Number(ultimoUid) + 1}:*`, gmraw: SIN_PROMOCIONES }
      : { since: new Date(desde || Date.now() - 7 * 86400000), gmraw: SIN_PROMOCIONES };
    let uids = (await client.search(criterio, { uid: true })) || [];
    // «N:*» siempre incluye el último mensaje aunque su UID sea menor: se filtra aquí.
    if (porUid) uids = uids.filter((u) => u > Number(ultimoUid));
    uids = uids.sort((a, b) => a - b).slice(0, max);
    const mensajes = [];
    for (const uid of uids) {
      const m = await client.fetchOne(String(uid), { uid: true, size: true, internalDate: true, envelope: true }, { uid: true });
      if (!m) continue;
      const base = {
        uid, mensajeId: `${validez}:${uid}`, messageId: m.envelope?.messageId || null,
        asunto: m.envelope?.subject || "", recibidoAt: (m.internalDate || m.envelope?.date || new Date()).toISOString(),
        remitente: m.envelope?.from?.[0] ? `${m.envelope.from[0].name || ""} <${m.envelope.from[0].address || ""}>`.trim() : "",
      };
      if ((m.size || 0) > MAX_FUENTE) {
        mensajes.push({ ...base, texto: "", encabezados: {}, adjuntos: [], demasiadoGrande: true });
        continue;
      }
      const completo = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
      const p = await simpleParser(completo.source, { skipImageLinks: true, skipTextToHtml: true });
      const texto = p.text || (p.html ? String(p.html).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ") : "");
      mensajes.push({
        ...base,
        texto,
        encabezados: {
          listUnsubscribe: !!p.headers.get("list-unsubscribe"),
          precedence: String(p.headers.get("precedence") || "").toLowerCase(),
        },
        adjuntos: (p.attachments || []).map((a) => ({
          nombre: a.filename || "adjunto", tipoMime: a.contentType || "application/octet-stream", tamano: a.size || a.content?.length || 0,
          contenido: a.content, inline: a.contentDisposition === "inline" && !!a.cid,
        })),
      });
    }
    return { uidValidity: validez, mensajes };
  });
}

// Enlace para abrir el correo en Gmail (funciona si el navegador tiene la sesión de ese Gmail abierta).
export function enlaceGmail(messageId) {
  if (!messageId) return null;
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`rfc822msgid:${String(messageId).replace(/^<|>$/g, "")}`)}`;
}
