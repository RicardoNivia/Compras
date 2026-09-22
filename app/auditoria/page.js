import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-server";
import { canViewAuditoria } from "@/lib/roles";
import { listAuditLogs, listAuditActors } from "@/lib/audit";
import AppShell from "@/components/AppShell";
import AuditoriaView from "@/components/AuditoriaView";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewAuditoria(user.role)) redirect("/registros");

  const [initial, actors] = await Promise.all([listAuditLogs({ page: 1, pageSize: 50 }), listAuditActors()]);

  return (
    <AppShell user={user} title="Auditoría" subtitle="Quién hizo qué sobre cada registro">
      <AuditoriaView initial={initial} actors={actors} />
    </AppShell>
  );
}
