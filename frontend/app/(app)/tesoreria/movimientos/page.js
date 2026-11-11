import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import MovimientosTesoreria from "@/components/tesoreria/MovimientosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Movimientos del banco" subtitle="Lo que entra y sale de cada banco, como en tus pestañas «Mvto»">
      <MovimientosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
