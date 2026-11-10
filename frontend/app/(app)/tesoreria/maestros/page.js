import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import MaestrosTesoreria from "@/components/tesoreria/MaestrosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Maestros de Tesorería" subtitle="Cuentas (con su moneda ISO 4217), ítems, conceptos y quién paga">
      <MaestrosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
