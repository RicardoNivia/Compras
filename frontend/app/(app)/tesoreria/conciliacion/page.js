import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ConciliacionTesoreria from "@/components/tesoreria/ConciliacionTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Conciliación" subtitle="Comprueba que tu registro y el banco digan lo mismo, y cierra el mes">
      <ConciliacionTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
