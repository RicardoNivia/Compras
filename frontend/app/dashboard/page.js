import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewDashboard } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import DashboardView from "@/components/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewDashboard(user.role)) redirect("/registros");

  const res = await backendFetch("/api/records");
  const { records } = await res.json();

  return (
    <AppShell user={user} title="Dashboard de compras" subtitle={`${records.length} registros`}>
      <DashboardView records={records} />
    </AppShell>
  );
}
