import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SubirRecibos from "@/components/consumo/SubirRecibos";

export const dynamic = "force-dynamic";

// Consumo: el acceso viene de la Matriz de permisos (user.consumo de /api/auth/me). Ver backend/lib/consumo/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.consumo) redirect("/");
  return (
    <AppShell user={user} title="Subir recibos" subtitle="Nova lee cada recibo, tú confirmas la sede y revisas antes de guardar">
      <SubirRecibos acceso={user.consumo} />
    </AppShell>
  );
}
