import nodemailer from "nodemailer";

// Modo mantenimiento: el tenant de Microsoft 365 tiene SMTP-AUTH bloqueado
// por política (ver el hint en sendReportEmail más abajo) y no hay una fecha
// en que TI lo vaya a habilitar — en vez de dejar que cada envío (manual o
// programado) falle igual con el mismo error 535, se bloquea desde el
// origen con un mensaje claro. Generar y guardar informes sigue funcionando
// normal; solo el envío queda pausado. Cambiar a `false` apenas TI habilite
// SMTP-AUTH (o se migre a otro proveedor) — también hay que quitar el aviso
// y volver a habilitar el botón "Enviar ahora" en frontend/components/InformesView.jsx.
export const MAIL_MAINTENANCE = true;
export const MAIL_MAINTENANCE_MESSAGE =
  "El envío de correos está temporalmente en mantenimiento (SMTP-AUTH bloqueado por el proveedor de correo). Puedes seguir generando y guardando informes con normalidad; el envío se reactivará apenas se resuelva.";

let cachedTransporter = null;

// Transporte SMTP genérico (host/puerto/usuario configurables por .env) — por
// defecto apunta a Office 365 (smtp.office365.com:587, STARTTLS) para poder
// usar un buzón corporativo existente de Sinco. Si el tenant bloquea
// SMTP-AUTH, sendMail falla con un error claro (ver sendReportEmail) en vez
// de quedar colgado; el informe sigue guardado y se puede reintentar.
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;

  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });
  return cachedTransporter;
}

export function isMailerConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

// El cuerpo del correo es "text" (siempre, respaldo para clientes que no
// renderizan HTML) y opcionalmente "html" (cuando el usuario lo editó
// directamente en el editor de texto enriquecido — ver
// lib/reportEmailBody.js#resolveEmailBody). El informe completo (secciones +
// gráficas) va como PDF adjunto (ver lib/reportPdf.js), no en el cuerpo.
// "attachments" sigue el formato de nodemailer: [{ filename, content: Buffer, contentType }].
export async function sendReportEmail({ to, cc, subject, text, html, attachments }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("El correo saliente no está configurado (SMTP_HOST/SMTP_USER/SMTP_PASSWORD en .env).");
  }
  const fromName = process.env.SMTP_FROM_NAME || "Panel de Compras y Bienestar Sinco";
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      ...(cc && cc.length ? { cc: Array.isArray(cc) ? cc.join(", ") : cc } : {}),
      subject,
      text,
      ...(html ? { html } : {}),
      ...(attachments && attachments.length ? { attachments } : {}),
    });
  } catch (err) {
    // Mensaje más útil que el genérico de nodemailer para el caso típico de
    // un tenant de Microsoft 365 con SMTP-AUTH deshabilitado por política.
    const hint = /auth|disabled|5\.7\./i.test(err?.message || "")
      ? " Es posible que el buzón tenga SMTP-AUTH deshabilitado por política del tenant — pide a TI habilitarlo para esta cuenta."
      : "";
    throw new Error(`No se pudo enviar el correo: ${err.message}.${hint}`);
  }
}
