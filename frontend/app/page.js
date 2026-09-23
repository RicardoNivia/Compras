import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewDashboard } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(canViewDashboard(user.role) ? "/dashboard" : "/registros");
}
