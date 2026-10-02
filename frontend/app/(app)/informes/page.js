import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewReportes } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import InformesView from "@/components/InformesView";

export const dynamic = "force-dynamic";

export default async function InformesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewReportes ?? canViewReportes(user.role))) redirect("/registros");

  const res = await backendFetch("/api/reports");
  const { reports } = await res.json();

  return (
    <AppShell user={user} title="Informes" subtitle="Resúmenes ejecutivos automáticos por correo">
      <InformesView initialReports={reports} />
    </AppShell>
  );
}
