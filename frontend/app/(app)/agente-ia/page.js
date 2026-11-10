import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewAgenteIA } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import AgenteChat from "@/components/AgenteChat";

export const dynamic = "force-dynamic";

export default async function AgenteIAPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewAgenteIA ?? canViewAgenteIA(user.role))) redirect("/registros");

  return (
    <AppShell user={user} title="Nova" subtitle="Tu asistente de IA">
      <AgenteChat userName={user.nombre} role={user.role} permissions={user.permissions} />
    </AppShell>
  );
}
