import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SedesConsumo from "@/components/consumo/SedesConsumo";

export const dynamic = "force-dynamic";

// Consumo: el acceso viene de la Matriz de permisos (user.consumo de /api/auth/me). Ver backend/lib/consumo/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.consumo) redirect("/");
  return (
    <AppShell user={user} title="Sedes y cuentas" subtitle="Cada sede con sus cuentas de energía, acueducto, gas y aseo">
      <SedesConsumo acceso={user.consumo} />
    </AppShell>
  );
}
