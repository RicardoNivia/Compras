import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ReportesTesoreria from "@/components/tesoreria/ReportesTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Reportes" subtitle="Las tablas dinámicas de tu Excel, calculadas solas">
      <ReportesTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
