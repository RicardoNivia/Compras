import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ReportesTesoreria from "@/components/tesoreria/ReportesTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Reportes" subtitle="Ejecutado y Por medio de pago, como en el Excel">
      <ReportesTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
