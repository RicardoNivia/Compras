import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiGuard";
import { formularioPublico, inscribirPublico } from "@/lib/participantesBienestar";
import { checkRateLimit, recordAttempt } from "@/lib/rateLimit";

// Formulario público de inscripción a una actividad de Bienestar (sin sesión: middleware.js lo deja pasar). El
// token del enlace es aleatorio y solo funciona mientras el formulario está abierto. Límite por IP contra abuso.
const LIMITE = { max: 20, windowMs: 10 * 60 * 1000 };

function ipDe(request) {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "desconocida";
}

/**
 * @openapi
 * /api/publico/inscripcion/{token}:
 *   get:
 *     tags: [Bienestar]
 *     summary: Datos públicos del formulario (nombre, fecha, línea y campos de la actividad). Sin sesión.
 *     security: []
 *     responses:
 *       200: { description: "{ formulario }" }
 *       404: { description: El formulario no existe o está cerrado. }
 *   post:
 *     tags: [Bienestar]
 *     summary: Inscribe a una persona ({ nombre, documento, area, correo, observacion, datos, autorizaDatos true }). Sin sesión, con límite por IP.
 *     security: []
 *     responses:
 *       200: { description: "{ ok, actividad }" }
 *       409: { description: Ya está inscrita. }
 *       429: { description: Demasiados intentos. }
 */
export async function GET(_request, { params }) {
  try {
    return NextResponse.json({ formulario: await formularioPublico(params.token) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const clave = `inscripcion:${ipDe(request)}`;
  const lim = checkRateLimit(clave, LIMITE);
  if (!lim.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429, headers: { "Retry-After": String(lim.retryAfterSeconds) } });
  }
  recordAttempt(clave, LIMITE);
  try {
    return NextResponse.json(await inscribirPublico(params.token, await request.json().catch(() => ({}))));
  } catch (err) {
    return apiError(err);
  }
}
