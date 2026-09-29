import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewPresupuesto } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import RegistrosPageClient from "@/components/RegistrosPageClient";

export const dynamic = "force-dynamic";

export default async function RegistrosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [recordsRes, maestrosRes, presupuestosRes] = await Promise.all([
    backendFetch("/api/records"),
    backendFetch("/api/maestros?onlyActive=1"),
    canViewPresupuesto(user.role) ? backendFetch("/api/presupuestos") : Promise.resolve(null),
  ]);
  const { records } = await recordsRes.json();
  const { maestros } = await maestrosRes.json();
  const presupuestos = presupuestosRes ? (await presupuestosRes.json()).presupuestos : [];

  return (
    <AppShell user={user} title="Registros" subtitle={`${records.length} registros`}>
      <RegistrosPageClient initialRecords={records} currentUser={user} maestros={maestros} presupuestos={presupuestos} />
    </AppShell>
  );
}
