import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewPresupuesto, canViewRegistros, canViewProveedores } from "@/lib/roles";
import RegistrosPageClient from "@/components/RegistrosPageClient";

export const dynamic = "force-dynamic";

export default async function RegistrosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // El rol Proveedores no trabaja en Registros: va a su módulo.
  if (!canViewRegistros(user.role) && (user.permissions?.viewProveedores ?? canViewProveedores(user.role))) redirect("/proveedores");
  const seePresupuesto = user.permissions?.viewPresupuesto ?? canViewPresupuesto(user.role);
  const [recordsRes, maestrosRes, proveedoresRes, alertasRes, presupuestosRes] = await Promise.all([
    backendFetch("/api/records"),
    backendFetch("/api/maestros?onlyActive=1"),
    backendFetch("/api/proveedores?onlyActive=1"),
    backendFetch("/api/proveedores/alertas"),
    seePresupuesto ? backendFetch("/api/presupuestos") : Promise.resolve(null),
  ]);
  const { records } = await recordsRes.json();
  const { maestros } = await maestrosRes.json();
  const { proveedores } = await proveedoresRes.json();
  const alertasProveedores = alertasRes.ok ? await alertasRes.json() : {};
  const presupuestos = presupuestosRes ? (await presupuestosRes.json()).presupuestos : [];

  return (
    <RegistrosPageClient
      user={user}
      initialRecords={records}
      currentUser={user}
      maestros={maestros}
      proveedores={proveedores}
      alertasProveedores={alertasProveedores}
      presupuestos={presupuestos}
    />
  );
}
