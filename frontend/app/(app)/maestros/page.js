import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewMaestros, canEditProveedores, ROLES_COMPRAS } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MaestrosView from "@/components/MaestrosView";

export const dynamic = "force-dynamic";

export default async function MaestrosPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewMaestros ?? canViewMaestros(user.role))) redirect("/registros");

  // Cada grupo de maestros lo administra su módulo: los de Compras los roles de Compras,
  // los de Proveedores (y el ciclo de actualización) quien pueda editar proveedores.
  const puedeProveedores = user.permissions?.editProveedores ?? canEditProveedores(user.role);
  const modulos = { Compras: ROLES_COMPRAS.includes(user.role), Proveedores: !!puedeProveedores };

  const [maestrosRes, cicloRes] = await Promise.all([
    backendFetch("/api/maestros"),
    puedeProveedores ? backendFetch("/api/proveedores/config") : Promise.resolve(null),
  ]);
  const { maestros } = await maestrosRes.json();
  const cicloConfig = cicloRes && cicloRes.ok ? await cicloRes.json() : null;

  return (
    <AppShell user={user} title="Maestros" subtitle="Opciones administrables de Compras y Proveedores, y el ciclo de proveedores">
      <MaestrosView
        initialMaestros={maestros}
        modulos={modulos}
        cicloConfig={cicloConfig}
        initialSeccion={searchParams?.seccion || null}
      />
    </AppShell>
  );
}
