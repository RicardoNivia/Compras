import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewPresupuesto } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import PresupuestoView from "@/components/PresupuestoView";

export const dynamic = "force-dynamic";

export default async function PresupuestoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewPresupuesto ?? canViewPresupuesto(user.role))) redirect("/registros");

  const [recordsRes, areasRes, categoriasRes, presupuestosRes] = await Promise.all([
    backendFetch("/api/records"),
    backendFetch("/api/maestros?tipo=area&onlyActive=1"),
    backendFetch("/api/maestros?tipo=categoria&onlyActive=1"),
    backendFetch("/api/presupuestos"),
  ]);
  const { records } = await recordsRes.json();
  const { maestros: areas } = await areasRes.json();
  const { maestros: categorias } = await categoriasRes.json();
  const { presupuestos } = await presupuestosRes.json();

  return (
    <AppShell user={user} title="Presupuesto" subtitle="Configura el presupuesto por área y año">
      <PresupuestoView
        records={records}
        areas={areas}
        categorias={categorias}
        initialPresupuestos={presupuestos}
      />
    </AppShell>
  );
}
