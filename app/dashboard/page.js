import { redirect } from "next/navigation";
import { listRecords } from "@/lib/records";
import { getSessionUser } from "@/lib/auth-server";
import { canViewDashboard } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import DashboardView from "@/components/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewDashboard(user.role)) redirect("/registros");

  const records = await listRecords();

  return (
    <AppShell user={user} title="Dashboard de compras" subtitle={`${records.length} registros`}>
      <DashboardView records={records} />
    </AppShell>
  );
}
