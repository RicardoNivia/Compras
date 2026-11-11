import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import PagosTesoreria from "@/components/tesoreria/PagosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Pagos programados" subtitle="Lo que tienes que pagar y recibir cada mes, con su estado P o E">
      <PagosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
