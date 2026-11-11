import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewBienestar, canEditBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import InventarioBodegaView from "@/components/bienestar/InventarioBodegaView";

export const dynamic = "force-dynamic";

// Inventario (bodega) de Bienestar: lo comparten Bienestar y Fundación. Lo ve quien ve cualquiera de las dos líneas y
// lo modifica quien edita cualquiera de las dos.
export default async function InventarioBienestarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ver = user.permissions?.viewInventarioBienestar ?? canViewBienestar(user.role);
  if (!ver) redirect("/registros");
  const puedeEditar = !!(user.permissions?.editInventarioBienestar ?? canEditBienestar(user.role));
  return (
    <AppShell user={user} title="Inventario" subtitle="Lo que hay en bodega para las actividades: las compras lo alimentan y las actividades lo consumen">
      <InventarioBodegaView puedeEditar={puedeEditar} />
    </AppShell>
  );
}
