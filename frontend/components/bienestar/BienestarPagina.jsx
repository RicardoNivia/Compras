import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewBienestar, canEditBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import BienestarView from "@/components/bienestar/BienestarView";

const TITULOS = {
  resumen: ["Resumen", "La participación de las actividades cruzada con su costo en Compras"],
  actividades: ["Actividades", "Registra cada actividad con su presupuesto, asistencia y compras"],
  cronograma: ["Cronograma", "El año y cada mes de un vistazo, con los festivos"],
};

// Carga común de las páginas del módulo de Bienestar: sesión, permiso, actividades de la línea y responsables. Cada
// page.js solo elige la vista y la línea — Bienestar (/bienestar/…) y Fundación (/bienestar/fundacion/…) van muy
// aparte: cada una con su resumen, su tabla y su cronograma, sin mezclar actividades ni gasto.
export default async function BienestarPagina({ vista, linea = "Bienestar" }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Bienestar y Fundación tienen permisos separados en la Matriz.
  const esFundacion = linea === "Fundación";
  const verLista = user.permissions?.[esFundacion ? "viewFundacion" : "viewBienestar"] ?? canViewBienestar(user.role);
  const verDashboard = user.permissions?.[esFundacion ? "viewDashboardFundacion" : "viewDashboardBienestar"] ?? canViewBienestar(user.role);
  const base = esFundacion ? "/bienestar/fundacion" : "/bienestar";
  if (vista === "resumen" && !verDashboard) redirect(verLista ? `${base}/actividades` : esFundacion ? "/bienestar" : (user.permissions?.viewDashboardFundacion || user.permissions?.viewFundacion) ? "/bienestar/fundacion" : "/registros");
  if (vista !== "resumen" && !verLista) redirect(verDashboard ? base : "/registros");
  const puedeEditar = user.permissions?.[esFundacion ? "editFundacion" : "editBienestar"] ?? canEditBienestar(user.role);

  const actividadesRes = await backendFetch(`/api/actividades?linea=${encodeURIComponent(linea)}`);
  const { actividades } = await actividadesRes.json();
  const [titulo, subtitulo] = TITULOS[vista];

  return (
    <AppShell user={user} title={linea === "Fundación" ? `Fundación · ${titulo}` : titulo} subtitle={subtitulo}>
      <BienestarView
        vista={vista}
        linea={linea}
        initialActividades={actividades}
        puedeEditar={puedeEditar}
      />
    </AppShell>
  );
}
