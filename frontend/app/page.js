import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewDashboard, ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (canViewDashboard(user.role)) redirect("/dashboard");
  if (user.role === ROLES.PROVEEDORES) redirect("/proveedores");
  redirect("/registros");
}
