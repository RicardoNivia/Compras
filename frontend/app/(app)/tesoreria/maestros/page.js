import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import MaestrosTesoreria from "@/components/tesoreria/MaestrosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Maestros de Tesorería" subtitle="Bancos, medios de pago, ítems, conceptos y quién paga">
      <MaestrosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
