import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SaldosTesoreria from "@/components/tesoreria/SaldosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Saldos de bancos" subtitle="Saldo inicial de enero y saldo de cada mes">
      <SaldosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
