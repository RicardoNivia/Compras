import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { completarVinculacion, COOKIE_ESTADO } from "@/lib/correoCuentas";
import { appUrl } from "@/lib/correoGraph";

/**
 * @openapi
 * /api/correo/callback:
 *   get:
 *     tags: [Mi correo]
 *     summary: "Retorno de Microsoft (redirect URI registrada en Entra ID). Valida el state con la sesión, canjea el código y guarda los tokens cifrados; vuelve a /mi-correo."
 */
export async function GET(request) {
  const url = new URL(request.url);
  const volver = (q) => {
    const res = NextResponse.redirect(`${appUrl()}/mi-correo?${new URLSearchParams(q)}`);
    res.cookies.set(COOKIE_ESTADO, "", { path: "/api/correo", maxAge: 0 });
    return res;
  };
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "vincularCorreo"))) return volver({ error: "No tienes permiso para vincular el correo." });
  const errorMs = url.searchParams.get("error");
  if (errorMs) {
    return volver({
      error: errorMs === "access_denied"
        ? "Cancelaste la autorización en Microsoft: el correo no se vinculó."
        : "Microsoft no autorizó la vinculación. Si dice que necesita aprobación de un administrador, pídesela a TI.",
    });
  }
  try {
    await completarVinculacion(user, {
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      nonceCookie: request.cookies.get(COOKIE_ESTADO)?.value,
    });
    return volver({ vinculado: "1" });
  } catch (err) {
    return volver({ error: err.message });
  }
}
