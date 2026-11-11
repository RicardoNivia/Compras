import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewBienestar, canEditBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import FichaActividad from "@/components/bienestar/FichaActividad";

// Página de la ficha de una actividad (Bienestar o Fundación): sesión y permisos; el detalle lo carga
// FichaActividad desde /api/actividades/[id]. La ficha también es donde se edita (ya no hay página "Editar"), así que
// recibe los responsables del maestro y las líneas que la persona puede usar.
export default async function FichaPagina({ id, linea = "Bienestar" }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const esFundacion = linea === "Fundación";
  if (!(user.permissions?.[esFundacion ? "viewFundacion" : "viewBienestar"] ?? canViewBienestar(user.role))) redirect("/registros");
  const puedeEditar = user.permissions?.[esFundacion ? "editFundacion" : "editBienestar"] ?? canEditBienestar(user.role);
  const basePath = linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar";
  const responsablesRes = puedeEditar ? await backendFetch("/api/maestros?tipo=responsableBienestar&onlyActive=1") : null;
  const { maestros } = responsablesRes?.ok ? await responsablesRes.json() : { maestros: [] };

  return (
    <AppShell user={user} title={linea === "Fundación" ? "Fundación · Actividad" : "Actividad"} subtitle="Todo en un solo lugar: datos, presupuesto, asistencia, inventario, compras y cierre">
      <FichaActividad
        actividadId={Number(id)}
        puedeEditar={puedeEditar}
        basePath={basePath}
        responsables={maestros.filter((m) => m.userId).map((m) => ({ userId: m.userId, nombre: m.valor }))}
        lineasPermitidas={[user.permissions?.editBienestar ?? canEditBienestar(user.role) ? "Bienestar" : null, user.permissions?.editFundacion ?? canEditBienestar(user.role) ? "Fundación" : null].filter(Boolean)}
      />
    </AppShell>
  );
}
