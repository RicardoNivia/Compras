import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session";
import { checkRateLimit, recordAttempt, resetRateLimit } from "@/lib/rateLimit";

// Máximo de intentos fallidos por IP+correo dentro de la ventana antes de bloquear.
const LOGIN_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Inicia sesión (única ruta pública, no requiere cookie previa).
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Sesión iniciada — la cookie httpOnly "session" queda seteada en la respuesta.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { user: { $ref: '#/components/schemas/User' } }
 *       400: { description: Faltan correo o contraseña. }
 *       401: { description: Credenciales inválidas o usuario inactivo. }
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = (body.email || "").toLowerCase().trim();
  const password = body.password || "";

  const rateLimitKey = `${getClientIp(request)}:${email || "sin-correo"}`;
  const { allowed, retryAfterSeconds } = checkRateLimit(rateLimitKey, LOGIN_RATE_LIMIT);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Intenta de nuevo más tarde." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Correo y contraseña son obligatorios." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.activo) {
    recordAttempt(rateLimitKey, LOGIN_RATE_LIMIT);
    return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    recordAttempt(rateLimitKey, LOGIN_RATE_LIMIT);
    return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
  }

  resetRateLimit(rateLimitKey);

  const token = await createSessionToken({
    sub: user.id,
    role: user.role,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });

  const res = NextResponse.json({
    user: { id: user.id, nombre: user.nombre, email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
