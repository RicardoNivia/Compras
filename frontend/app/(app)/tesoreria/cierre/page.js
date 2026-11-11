import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import CierreTesoreria from "@/components/tesoreria/CierreTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Cierre de mes" subtitle="Lo que falta para firmar el mes y los reportes que salen de él">
      <CierreTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
