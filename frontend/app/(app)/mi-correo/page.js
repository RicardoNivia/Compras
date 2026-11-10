import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canVincularCorreo, canEditProveedores } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MiCorreoView from "@/components/correo/MiCorreoView";

export const dynamic = "force-dynamic";

// Mi correo: vincular el correo de Microsoft 365 y el agente que deja en la Bandeja las solicitudes de proveedor
// (ver backend/lib/agenteCorreoProveedores.js). ?vinculado=1 / ?error=… llegan de la vuelta de Microsoft.
export default async function MiCorreoPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.vincularCorreo ?? canVincularCorreo(user.role))) redirect("/");

  const res = await backendFetch("/api/correo");
  const inicial = res.ok ? await res.json() : { modo: "desactivado", cuenta: null, pendientes: 0, emailUsuario: user.email };
  const error = typeof searchParams?.error === "string" ? searchParams.error.slice(0, 400) : "";

  return (
    <AppShell user={user} title="Mi correo" subtitle="El agente lee las solicitudes de proveedor que te llegan y te las deja en la Bandeja">
      <MiCorreoView
        inicial={inicial}
        vinculado={searchParams?.vinculado === "1"}
        errorVinculo={error}
        puedeRegistrar={user.permissions?.editProveedores ?? canEditProveedores(user.role)}
      />
    </AppShell>
  );
}
