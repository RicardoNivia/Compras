import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Centraliza el patrón repetido en los route handlers: obtener el usuario de
// sesión y validar un permiso de la Matriz de permisos (lib/permissions.js)
// antes de ejecutar la lógica de la ruta.
//
// Uso:
//   const { user, denied } = await requirePermission("editRecord");
//   if (denied) return denied;
export async function requirePermission(feature) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, feature))) {
    return { user: null, denied: NextResponse.json({ error: "No autorizado." }, { status: 403 }) };
  }
  return { user, denied: null };
}

// Igual que requirePermission, para lo que sirve a más de un módulo (p. ej. los maestros de Compras y los de Bienestar).
export async function requireAlgunPermiso(features) {
  const user = await getSessionUser();
  const permitido = user && (await Promise.all(features.map((f) => isRoleAllowed(user.role, f)))).some(Boolean);
  if (!permitido) return { user: null, denied: NextResponse.json({ error: "No autorizado." }, { status: 403 }) };
  return { user, denied: null };
}

// Bienestar y Fundación tienen permisos separados: el de una actividad depende de su línea.
const FEATURE_POR_LINEA = {
  ver: { Bienestar: "viewBienestar", "Fundación": "viewFundacion" },
  editar: { Bienestar: "editBienestar", "Fundación": "editFundacion" },
  dashboard: { Bienestar: "viewDashboardBienestar", "Fundación": "viewDashboardFundacion" },
};
export const featureDeLinea = (accion, linea) => FEATURE_POR_LINEA[accion][linea === "Fundación" ? "Fundación" : "Bienestar"];

export async function requirePermisoActividad(actividadId, accion) {
  const a = await prisma.actividadBienestar.findUnique({ where: { id: Number(actividadId) || 0 }, select: { linea: true } });
  return requirePermission(featureDeLinea(accion, a?.linea));
}

// Centraliza el formato de respuesta de error usado por los route handlers:
// los errores de validación lanzados desde lib/* llegan como Error con una
// propiedad .status (p.ej. 400) que se expone tal cual; el resto cae a 500.
export function apiError(err) {
  // El trigger trg_texto_sin_danos (migración texto_sin_caracteres_danados) rechazó texto con U+FFFD.
  if (/caracteres dañados/.test(String(err?.message || ""))) {
    return NextResponse.json(
      { error: "El texto contiene caracteres dañados, normalmente por una codificación que no es UTF-8. Vuelve a escribir los acentos y la ñ y reintenta." },
      { status: 400 }
    );
  }
  return NextResponse.json({ error: err.message }, { status: err.status || 500 });
}
