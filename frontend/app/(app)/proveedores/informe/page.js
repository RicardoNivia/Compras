import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewProveedores } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import ProveedoresNav from "@/components/proveedores/ProveedoresNav";
import InformeMensual from "@/components/proveedores/InformeMensual";

export const dynamic = "force-dynamic";

export default async function InformeMensualProveedoresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewProveedores ?? canViewProveedores(user.role))) redirect("/registros");

  const res = await backendFetch("/api/proveedores/informe");
  const initial = await res.json();

  return (
    <AppShell user={user} title="Informe mensual de proveedores" subtitle="Nuevos, actualizados y cambios realizados en el mes">
      <ProveedoresNav active="informe" />
      <div className="dashboard-shell">
        <InformeMensual initial={initial} />
      </div>
    </AppShell>
  );
}
