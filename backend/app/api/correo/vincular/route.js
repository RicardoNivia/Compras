import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { iniciarVinculacion, vincularSimulado, COOKIE_ESTADO } from "@/lib/correoCuentas";
import { appUrl } from "@/lib/correoGraph";

const volver = (q) => NextResponse.redirect(`${appUrl()}/mi-correo?${new URLSearchParams(q)}`);

/**
 * @openapi
 * /api/correo/vincular:
 *   get:
 *     tags: [Mi correo]
 *     summary: "Navegación del navegador: redirige al inicio de sesión de Microsoft para autorizar la lectura del correo (en modo simulado vincula sin Microsoft). Permiso vincularCorreo."
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "vincularCorreo"))) return volver({ error: "No tienes permiso para vincular el correo." });
  try {
    const r = await iniciarVinculacion(user);
    if (r.simulado) {
      await vincularSimulado(user);
      return volver({ vinculado: "1" });
    }
    const res = NextResponse.redirect(r.url);
    res.cookies.set(COOKIE_ESTADO, r.nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/correo", maxAge: 600 });
    return res;
  } catch (err) {
    return volver({ error: err.message });
  }
}
