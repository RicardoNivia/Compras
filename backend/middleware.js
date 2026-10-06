import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/api/auth/login"]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (!payload) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
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
