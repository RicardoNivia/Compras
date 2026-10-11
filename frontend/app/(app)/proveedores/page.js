import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewProveedores, canEditProveedores } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import ProveedoresNav from "@/components/proveedores/ProveedoresNav";
import MaestroProveedores from "@/components/proveedores/MaestroProveedores";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewProveedores ?? canViewProveedores(user.role))) redirect("/registros");
  const canEdit = user.permissions?.editProveedores ?? canEditProveedores(user.role);

  const [maestroRes, areasRes, motivosRes] = await Promise.all([
    backendFetch("/api/proveedores/maestro"),
    backendFetch("/api/maestros?tipo=area&onlyActive=1"),
    backendFetch("/api/maestros?tipo=motivoExcepcion&onlyActive=1"),
  ]);
  const initial = await maestroRes.json();
  const { maestros: areas } = await areasRes.json();
  const { maestros: motivos } = await motivosRes.json();

  return (
    <AppShell user={user} title="Proveedores" subtitle="Gestión de proveedores · estado del ciclo de actualización">
      <ProveedoresNav active="maestro" />
      <MaestroProveedores initial={initial} areas={areas} motivos={motivos} canEdit={canEdit} />
    </AppShell>
  );
}
