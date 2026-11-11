import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import PeriodicosTesoreria from "@/components/tesoreria/PeriodicosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Gastos periódicos" subtitle="Lo que se repite: arriendos, servicios, nóminas, administraciones">
      <PeriodicosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
