import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canVincularCorreo } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MiCorreoView from "@/components/correo/MiCorreoView";

export const dynamic = "force-dynamic";

// Mi correo: la única página del correo de la aplicación (Gmail de solicitudes, ver backend/lib/buzonCompartido.js).
// Solo soportes de pago: Pagos (registro en Tesorería) y Conexión (solo admin).
export default async function MiCorreoPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.vincularCorreo ?? canVincularCorreo(user.role))) redirect("/");

  return (
    <AppShell user={user} title="Mi correo" subtitle="Los soportes de pago que llegan al correo y que Nova lee">
      <MiCorreoView
        esAdmin={user.role === "admin"}
        puedePagos={!!user.tesoreria?.puedeRegistrar}
      />
    </AppShell>
  );
}
