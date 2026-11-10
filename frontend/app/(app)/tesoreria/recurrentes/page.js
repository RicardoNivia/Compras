import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import RecurrentesTesoreria from "@/components/tesoreria/RecurrentesTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Pagos recurrentes" subtitle="Generan solos el proyectado de cada mes">
      <RecurrentesTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
