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

  const isAdmin = payload.role === "admin";
  const adminOnly = ["/api/users", "/api/audit"];
  if (adminOnly.some((p) => pathname.startsWith(p)) && !isAdmin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
