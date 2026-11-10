import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewBienestar, canEditBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import FichaActividad from "@/components/bienestar/FichaActividad";

// Página de la ficha de una actividad (Bienestar o Fundación): sesión y permisos; el detalle lo carga
// FichaActividad desde /api/actividades/[id].
export default async function FichaPagina({ id, linea = "Bienestar" }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const esFundacion = linea === "Fundación";
  if (!(user.permissions?.[esFundacion ? "viewFundacion" : "viewBienestar"] ?? canViewBienestar(user.role))) redirect("/registros");
  const puedeEditar = user.permissions?.[esFundacion ? "editFundacion" : "editBienestar"] ?? canEditBienestar(user.role);
  const basePath = linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar";

  return (
    <AppShell user={user} title={linea === "Fundación" ? "Fundación · Actividad" : "Actividad"} subtitle="Todo el detalle: presupuesto, asistencia, inventario, compras y cierre">
      <FichaActividad
        actividadId={Number(id)}
        puedeEditar={puedeEditar}
        basePath={basePath}
      />
    </AppShell>
  );
}
