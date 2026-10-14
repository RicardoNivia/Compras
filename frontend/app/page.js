import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewAlertas, canViewDashboard, ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Primera pantalla tras iniciar sesión: el Dashboard si el rol lo tiene habilitado; si no, "Mi día y alertas"
// (disponible para todos los roles). Los demás destinos son solo respaldo si un rol no tuviera ninguna de las dos.
export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.permissions?.viewDashboard ?? canViewDashboard(user.role)) redirect("/dashboard");
  if (user.permissions?.viewAlertas ?? canViewAlertas(user.role)) redirect("/alertas");
  if (user.role === ROLES.PROVEEDORES) redirect("/proveedores");
  redirect("/registros");
}
