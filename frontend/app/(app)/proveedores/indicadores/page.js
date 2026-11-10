import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewProveedores } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import ProveedoresNav from "@/components/proveedores/ProveedoresNav";
import IndicadoresProveedores from "@/components/proveedores/IndicadoresProveedores";

export const dynamic = "force-dynamic";

export default async function IndicadoresProveedoresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewProveedores ?? canViewProveedores(user.role))) redirect("/registros");

  const res = await backendFetch("/api/proveedores/indicadores");
  const data = await res.json();

  return (
    <AppShell user={user} title="Indicadores de proveedores" subtitle={`Ciclo ${data.anio} · datos al día de hoy`}>
      <ProveedoresNav active="indicadores" />
      <div className="dashboard-shell">
        <IndicadoresProveedores data={data} />
      </div>
    </AppShell>
  );
}
