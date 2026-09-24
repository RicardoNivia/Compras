import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/login"]);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
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

  const isAdmin = payload.role === "admin";
  const adminOnly = ["/usuarios", "/auditoria", "/maestros"];
  if (adminOnly.some((p) => pathname.startsWith(p)) && !isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/registros";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
