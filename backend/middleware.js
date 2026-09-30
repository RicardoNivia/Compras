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

  // La autorización fina (admin vs. otros roles, y las excepciones de la
  // Matriz de permisos) se resuelve en cada route handler — el middleware
  // corre en Edge runtime y no tiene acceso a Prisma/la base de datos.
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
