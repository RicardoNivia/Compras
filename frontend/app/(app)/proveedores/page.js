import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewProveedores, canEditProveedores } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import ProveedoresNav from "@/components/proveedores/ProveedoresNav";
import MaestroProveedores from "@/components/proveedores/MaestroProveedores";
import { cargarCatalogosProveedor } from "@/lib/catalogosProveedor";

export const dynamic = "force-dynamic";

// searchParams.q: abre la lista ya filtrada por ese NIT o nombre (lo usan los botones "Ir" de Mi día y alertas).
export default async function ProveedoresPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewProveedores ?? canViewProveedores(user.role))) redirect("/registros");
  const canEdit = user.permissions?.editProveedores ?? canEditProveedores(user.role);

  const q = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const [maestroRes, catalogos] = await Promise.all([
    backendFetch(`/api/proveedores/maestro${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    cargarCatalogosProveedor(),
  ]);
  const initial = await maestroRes.json();

  return (
    <AppShell user={user} title="Proveedores" subtitle="Gestión de proveedores · estado del ciclo de actualización">
      <ProveedoresNav active="maestro" />
      <MaestroProveedores initial={initial} catalogos={catalogos} canEdit={canEdit} initialQ={q} />
    </AppShell>
  );
}
