import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewPresupuesto, canViewRegistros, canViewProveedores, canViewBienestar } from "@/lib/roles";
import RegistrosPageClient from "@/components/RegistrosPageClient";

export const dynamic = "force-dynamic";

export default async function RegistrosPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Sin "Ver Registros" (Matriz de permisos) se va al módulo que sí tenga: Bienestar o Proveedores.
  if (!(user.permissions?.viewRegistros ?? canViewRegistros(user.role))) {
    if (user.permissions?.viewBienestar ?? canViewBienestar(user.role)) redirect("/bienestar");
    if (user.permissions?.viewProveedores ?? canViewProveedores(user.role)) redirect("/proveedores");
  }
  const seePresupuesto = user.permissions?.viewPresupuesto ?? canViewPresupuesto(user.role);
  const [recordsRes, maestrosRes, proveedoresRes, alertasRes, presupuestosRes, actividadesRes] = await Promise.all([
    backendFetch("/api/records"),
    backendFetch("/api/maestros?onlyActive=1"),
    backendFetch("/api/proveedores?onlyActive=1"),
    backendFetch("/api/proveedores/alertas"),
    seePresupuesto ? backendFetch("/api/presupuestos") : Promise.resolve(null),
    // Actividades de Bienestar para asociar cada compra a la suya (ver RecordModal.jsx).
    backendFetch("/api/actividades"),
  ]);
  const { records } = await recordsRes.json();
  const { maestros } = await maestrosRes.json();
  const { proveedores } = await proveedoresRes.json();
  const alertasProveedores = alertasRes.ok ? await alertasRes.json() : {};
  const presupuestos = presupuestosRes ? (await presupuestosRes.json()).presupuestos : [];
  const actividades = actividadesRes.ok ? (await actividadesRes.json()).actividades : [];

  return (
    <RegistrosPageClient
      user={user}
      initialRecords={records}
      currentUser={user}
      maestros={maestros}
      proveedores={proveedores}
      alertasProveedores={alertasProveedores}
      presupuestos={presupuestos}
      actividades={actividades}
      nuevaCompraActividad={Number(searchParams?.nuevaCompraActividad) || null}
    />
  );
}
