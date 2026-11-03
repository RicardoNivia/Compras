import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewBienestar, canEditBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import ActividadFormulario from "@/components/bienestar/ActividadFormulario";

// Página del formulario de una actividad (Bienestar o Fundación): con id edita, sin id crea (fechaInicial viene del "+"
// del cronograma). Crear y editar exigen editBienestar; quien solo puede ver se queda en la ficha o la lista.
export default async function FormularioPagina({ id, linea = "Bienestar", fechaInicial }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const esFundacion = linea === "Fundación";
  if (!(user.permissions?.[esFundacion ? "viewFundacion" : "viewBienestar"] ?? canViewBienestar(user.role))) redirect("/registros");
  const basePath = linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar";
  if (!(user.permissions?.[esFundacion ? "editFundacion" : "editBienestar"] ?? canEditBienestar(user.role))) redirect(id ? `${basePath}/actividades/${id}` : `${basePath}/actividades`);
  const responsablesRes = await backendFetch("/api/maestros?tipo=responsableBienestar&onlyActive=1");
  const { maestros } = responsablesRes.ok ? await responsablesRes.json() : { maestros: [] };
  let actividad = null;
  if (id) {
    const res = await backendFetch(`/api/actividades/${encodeURIComponent(id)}`);
    if (!res.ok) redirect(`${basePath}/actividades`);
    actividad = (await res.json()).actividad;
    if (actividad.estado === "cerrada") redirect(`${basePath}/actividades/${id}`); // cerrada: ya no se modifica
  }
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaInicial || "") ? fechaInicial : "";

  return (
    <AppShell user={user} title={id ? "Editar actividad" : "Nueva actividad"} subtitle={linea === "Fundación" ? "Fundación" : "Bienestar"}>
      <ActividadFormulario
        actividad={actividad}
        lineaPorDefecto={linea}
        lineasPermitidas={[user.permissions?.editBienestar ?? canEditBienestar(user.role) ? "Bienestar" : null, user.permissions?.editFundacion ?? canEditBienestar(user.role) ? "Fundación" : null].filter(Boolean)}
        fechaInicial={fecha}
        responsables={maestros.filter((m) => m.userId).map((m) => ({ userId: m.userId, nombre: m.valor }))}
        puedeEditar
        basePath={basePath}
      />
    </AppShell>
  );
}
