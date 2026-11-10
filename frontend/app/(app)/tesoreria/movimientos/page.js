import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import MovimientosTesoreria from "@/components/tesoreria/MovimientosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Movimientos" subtitle="El libro de tesorería: cada ingreso, egreso o traslado con su soporte">
      <MovimientosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
