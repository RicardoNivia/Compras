import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Texto con caracteres dañados (U+FFFD): llega así cuando un cliente manda una codificación que no es UTF-8 y el
// acento o la ñ ya no se puede recuperar. Se rechaza aquí con un mensaje claro; la base de datos lo rechaza también
// (trigger trg_texto_sin_danos) por si algo escribe sin pasar por la API.
const MENSAJE_TEXTO_DANADO =
  "El texto contiene caracteres dañados (\uFFFD), normalmente por una codificación que no es UTF-8. Vuelve a escribir los acentos y la ñ y reintenta.";
const TIENE_TEXTO_DANADO = /\uFFFD|\\u[fF][fF][fF][dD]/;
const LIMITE_REVISION_BYTES = 2_000_000; // los cuerpos enormes (imágenes en base64) los cubre el trigger de la BD

// /api/mcp se autentica con su propio token personal (Bearer, solo de usuarios admin — ver lib/mcpTokens.js), no con la cookie de sesión.
const PUBLIC_PATHS = new Set(["/api/auth/login", "/api/mcp"]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Formularios públicos de inscripción a actividades de Bienestar (enlace con token, sin sesión). El trigger de la
  // BD igual rechaza un U+FFFD en lo que escriban.
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/publico/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (!payload) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (
    ["POST", "PUT", "PATCH"].includes(request.method) &&
    (request.headers.get("content-type") || "").includes("application/json") &&
    Number(request.headers.get("content-length") || 0) <= LIMITE_REVISION_BYTES
  ) {
    const cuerpo = await request.clone().text();
    if (TIENE_TEXTO_DANADO.test(cuerpo)) return NextResponse.json({ error: MENSAJE_TEXTO_DANADO }, { status: 400 });
  }

  // La documentación Swagger (/docs y el spec que consume, /api/openapi.json)
  // expone la forma completa de la API (rutas, parámetros, shapes) — se
  // restringe a admin aquí mismo (a diferencia del resto de /api/*, cuya
  // autorización fina se resuelve en cada route handler) porque /docs es una
  // página, no una API route con su propio permiso en lib/permissions.js.
  if ((pathname === "/docs" || pathname === "/api/openapi.json") && payload.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // La autorización fina (admin vs. otros roles, y las excepciones de la
  // Matriz de permisos) se resuelve en cada route handler — el middleware
  // corre en Edge runtime y no tiene acceso a Prisma/la base de datos.
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/docs"],
};
