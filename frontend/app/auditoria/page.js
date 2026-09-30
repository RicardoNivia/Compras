import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewAuditoria } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import AuditoriaView from "@/components/AuditoriaView";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewAuditoria ?? canViewAuditoria(user.role))) redirect("/registros");

  const [initialRes, actorsRes] = await Promise.all([
    backendFetch("/api/audit?page=1&pageSize=50"),
    backendFetch("/api/audit/actors"),
  ]);
  const initial = await initialRes.json();
  const { actors } = await actorsRes.json();

  return (
    <AppShell user={user} title="Auditoría" subtitle="Quién hizo qué sobre registros, maestros y usuarios">
      <AuditoriaView initial={initial} actors={actors} />
    </AppShell>
  );
}
