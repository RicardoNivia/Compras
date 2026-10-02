import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewAlertas } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import AlertasView from "@/components/AlertasView";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewAlertas ?? canViewAlertas(user.role))) redirect("/registros");

  const res = await backendFetch("/api/alerts");
  const data = await res.json();

  return (
    <AppShell user={user} title="Alertas y notificaciones" subtitle="Solicitudes pendientes, presupuesto en riesgo y atrasos de entrega">
      <AlertasView initialData={data} />
    </AppShell>
  );
}
