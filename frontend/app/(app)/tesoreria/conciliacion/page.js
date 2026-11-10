import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ConciliacionTesoreria from "@/components/tesoreria/ConciliacionTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Conciliación bancaria" subtitle="Extracto del banco contra el libro, cuenta por cuenta">
      <ConciliacionTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
