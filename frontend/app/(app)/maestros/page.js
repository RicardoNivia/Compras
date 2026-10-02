import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewMaestros } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MaestrosView from "@/components/MaestrosView";

export const dynamic = "force-dynamic";

export default async function MaestrosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewMaestros ?? canViewMaestros(user.role))) redirect("/registros");

  const res = await backendFetch("/api/maestros");
  const { maestros } = await res.json();

  return (
    <AppShell user={user} title="Maestros" subtitle="Opciones administrables del formulario de registros">
      <MaestrosView initialMaestros={maestros} />
    </AppShell>
  );
}
