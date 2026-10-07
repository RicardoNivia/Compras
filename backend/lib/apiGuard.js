import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

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

// Centraliza el formato de respuesta de error usado por los route handlers:
// los errores de validación lanzados desde lib/* llegan como Error con una
// propiedad .status (p.ej. 400) que se expone tal cual; el resto cae a 500.
export function apiError(err) {
  return NextResponse.json({ error: err.message }, { status: err.status || 500 });
}
