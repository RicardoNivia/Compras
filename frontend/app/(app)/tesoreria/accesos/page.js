import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AccesosTesoreria from "@/components/tesoreria/AccesosTesoreria";

export const dynamic = "force-dynamic";

// Tesorería: acceso NOMINAL (user.tesoreria viene de /api/auth/me), no por rol. Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria?.puedeFirmar && !user.tesoreriaArranque) redirect(user.tesoreria ? "/tesoreria" : "/");
  return (
    <AppShell user={user} title="Accesos a Tesorería" subtitle="Quién puede ver, registrar y firmar en el módulo">
      <AccesosTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
