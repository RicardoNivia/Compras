import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ResumenTesoreria from "@/components/tesoreria/ResumenTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Flujo de caja" subtitle="Ingresos y egresos ejecutados y proyectados de todas las cuentas">
      <ResumenTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
