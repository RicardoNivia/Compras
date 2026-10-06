import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cierra sesión — limpia la cookie httpOnly "session".
 *     responses:
 *       200:
 *         description: Sesión cerrada.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
