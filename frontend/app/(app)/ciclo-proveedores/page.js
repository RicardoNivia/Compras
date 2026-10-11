import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canEditProveedores, canViewProveedores } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import ConfigCicloProveedores from "@/components/proveedores/ConfigCicloProveedores";

export const dynamic = "force-dynamic";

export default async function CicloProveedoresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.editProveedores ?? canEditProveedores(user.role))) redirect(canViewProveedores(user.role) ? "/proveedores" : "/registros");

  const res = await backendFetch("/api/proveedores/config");
  const config = await res.json();

  return (
    <AppShell user={user} title="Ciclo de proveedores" subtitle="Fecha de corte de la actualización anual">
      <ConfigCicloProveedores initial={config} />
    </AppShell>
  );
}
