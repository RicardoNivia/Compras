import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/login"]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // El formulario público de inscripción a actividades de Bienestar no pide sesión (enlace con token).
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/inscripcion/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (!payload) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // "Conectar con Claude" es solo para administradores: cualquier otro rol vuelve a Registros (redirect real, no solo en la página).
  if ((pathname === "/conectar-claude" || pathname.startsWith("/conectar-claude/")) && payload.role !== "admin") {
    const url = request.nextUrl.clone();
    url.pathname = "/registros";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // La autorización fina (admin vs. otros roles, y las excepciones de la
  // Matriz de permisos) se resuelve en cada page.js (server component, con
  // acceso a la BD vía el backend) — el middleware corre en Edge runtime y
  // no puede consultarla, así que aquí solo se exige estar autenticado.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/).*)"],
};
