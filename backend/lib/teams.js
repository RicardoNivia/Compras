// Envío a Microsoft Teams por el webhook de un flujo de Power Automate ("Flujos de trabajo" de Teams).
// Configuración y prueba local: docs/notificaciones-diseno.md §10.
//
// Un solo flujo para toda la app: el JSON lleva `destinatario` (correo) y `clave` (secreto compartido que el flujo
// valida), y el flujo le escribe por chat a esa persona con el bot de Flujos de trabajo.
//
// TEAMS_MODO: "desactivado" (por defecto) | "simulado" (arma la tarjeta y no la envía) | "real".
// TEAMS_DESTINO_PRUEBA: si está definida, TODO envío se redirige a ese correo. Fuera de producción es obligatoria:
// sin ella no se envía nada (así una prueba local nunca le escribe a un compañero).
// La URL del webhook es un secreto: nunca se devuelve al cliente, ni se escribe en logs ni en auditoría.

const TIMEOUT_MS = 10000;

export function modoTeams() {
  const modo = String(process.env.TEAMS_MODO || "desactivado").trim().toLowerCase();
  if (modo === "real" && !process.env.TEAMS_WEBHOOK_URL) return "desactivado";
  return ["real", "simulado"].includes(modo) ? modo : "desactivado";
}

export function estadoTeams() {
  return { modo: modoTeams(), destinoPrueba: process.env.TEAMS_DESTINO_PRUEBA ? true : false };
}

// Errores que vale la pena reintentar (límite de peticiones o falla temporal del servicio).
export function esReintentable(status) {
  return status === 429 || status === 408 || (status >= 500 && status < 600) || status === 0;
}

// destinatario: correo de la persona. card: Adaptive Card (objeto `content`).
// Devuelve { ok, status, motivo, simulado, redirigidoA }. Nunca lanza.
export async function enviarTarjeta(destinatario, card) {
  const modo = modoTeams();
  if (modo === "desactivado") return { ok: false, status: null, motivo: "Teams no está configurado en el servidor." };
  if (!destinatario) return { ok: false, status: null, motivo: "La persona no tiene correo registrado." };

  const destinoPrueba = process.env.TEAMS_DESTINO_PRUEBA?.trim();
  // Fuera de producción NUNCA se le escribe a la persona real: todo va al correo de prueba, y sin él no se envía.
  if (!destinoPrueba && process.env.NODE_ENV !== "production") {
    return { ok: false, status: null, motivo: "En local, Teams solo envía a TEAMS_DESTINO_PRUEBA y no está definida: no se envió." };
  }
  const destino = destinoPrueba || destinatario;
  const body = {
    clave: process.env.TEAMS_CLAVE_FLUJO || "",
    destinatario: destino,
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }],
  };

  if (modo === "simulado") {
    console.log(`[teams:simulado] para ${destino}${destinoPrueba ? ` (era para ${destinatario})` : ""}: ${JSON.stringify(card).slice(0, 400)}`);
    return { ok: true, status: 202, simulado: true, redirigidoA: destinoPrueba || null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(process.env.TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 202 || res.ok) return { ok: true, status: res.status, redirigidoA: destinoPrueba || null };
    const texto = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, status: res.status, motivo: `Teams respondió HTTP ${res.status}${texto ? `: ${texto}` : ""}` };
  } catch (err) {
    const motivo = err?.name === "AbortError" ? "Teams no respondió en 10 s." : `No se pudo conectar con Teams (${err?.code || err?.message || "error de red"}).`;
    return { ok: false, status: 0, motivo };
  } finally {
    clearTimeout(timer);
  }
}
