import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ImportarPlantilla from "@/components/tesoreria/ImportarPlantilla";

export const dynamic = "force-dynamic";

// Tesorería: el acceso viene de la Matriz de permisos (user.tesoreria de /api/auth/me). Ver backend/lib/tesoreria/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Importar plantilla" subtitle="Sube tu «Flujo de Caja» de Excel y elige qué se carga">
      <ImportarPlantilla acceso={user.tesoreria} />
    </AppShell>
  );
}
