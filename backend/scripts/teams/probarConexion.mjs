// Prueba la conexión con el flujo de Teams de las notificaciones (docs/notificaciones-diseno.md §10.4).
// Uso, desde backend/:  npm run teams:probar  [correo-destino]
// Lee TEAMS_WEBHOOK_URL, TEAMS_CLAVE_FLUJO y TEAMS_DESTINO_PRUEBA de backend/.env. Envía con fetch de Node en UTF-8
// (nunca probar con curl desde Windows: daña las tildes y el webhook responde 400). La URL nunca se imprime.

import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const linea of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const url = process.env.TEAMS_WEBHOOK_URL;
const destino = process.argv[2] || process.env.TEAMS_DESTINO_PRUEBA;
if (!url) { console.error("Falta TEAMS_WEBHOOK_URL en backend/.env."); process.exit(1); }
if (!destino) { console.error("Indica el correo destino: npm run teams:probar usuario@example.com (o define TEAMS_DESTINO_PRUEBA)."); process.exit(1); }

const card = {
  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  type: "AdaptiveCard",
  version: "1.4",
  body: [
    { type: "TextBlock", text: "Prueba de conexión · Panel de Compras y Bienestar", weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: "Si ves bien las tildes y la eñe (José, compañía, ñandú, acción), el flujo de notificaciones está listo.", wrap: true },
    { type: "TextBlock", text: new Date().toLocaleString("es-CO"), isSubtle: true, size: "Small" },
  ],
};

const body = {
  clave: process.env.TEAMS_CLAVE_FLUJO || "",
  destinatario: destino,
  type: "message",
  attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", contentUrl: null, content: card }],
};

try {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const texto = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 202 || res.ok) {
    console.log(`OK: HTTP ${res.status}. Debe llegarle a ${destino} un chat del bot de Flujos de trabajo.`);
    console.log("Si no llega, revisa el historial de ejecuciones del flujo en Power Automate (un 202 solo significa \"recibido\").");
  } else {
    console.error(`Error: HTTP ${res.status}${texto ? ` — ${texto}` : ""}`);
    process.exit(1);
  }
} catch (e) {
  console.error(`No se pudo conectar: ${e?.message || e}`);
  process.exit(1);
}
