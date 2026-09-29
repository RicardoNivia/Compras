import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewDashboard, canViewPresupuesto } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import DashboardView from "@/components/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewDashboard(user.role)) redirect("/registros");

  const [recordsRes, presupuestosRes] = await Promise.all([
    backendFetch("/api/records"),
    canViewPresupuesto(user.role) ? backendFetch("/api/presupuestos") : Promise.resolve(null),
  ]);
  const { records } = await recordsRes.json();
  const presupuestos = presupuestosRes ? (await presupuestosRes.json()).presupuestos : [];

  return (
    <AppShell user={user} title="Dashboard de compras" subtitle={`${records.length} registros`}>
      <DashboardView records={records} presupuestos={presupuestos} />
    </AppShell>
  );
}
