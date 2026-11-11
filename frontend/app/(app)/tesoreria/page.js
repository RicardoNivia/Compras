import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ResumenTesoreria from "@/components/tesoreria/ResumenTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Dashboard de Tesorería" subtitle="Flujo de caja, saldos de los bancos y cumplimiento de los pagos">
      <ResumenTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
