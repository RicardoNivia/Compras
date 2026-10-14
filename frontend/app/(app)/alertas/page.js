import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewAlertas } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MiDiaView from "@/components/MiDiaView";

export const dynamic = "force-dynamic";

// "Mi día y alertas": lo que le toca hacer hoy al usuario según su rol (ver backend/lib/pendientes.js).
export default async function AlertasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewAlertas ?? canViewAlertas(user.role))) redirect("/registros");

  const res = await backendFetch("/api/pendientes");
  const data = res.ok ? await res.json() : { rol: user.role, totales: { total: 0, criticos: 0, atencion: 0 }, secciones: [] };

  return (
    <AppShell user={user} title="Mi día y alertas" subtitle="Lo que te toca hacer hoy, por urgencia">
      <MiDiaView initialData={data} user={user} />
    </AppShell>
  );
}
