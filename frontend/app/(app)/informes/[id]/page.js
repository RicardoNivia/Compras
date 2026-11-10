import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewReportes } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import EstudioInforme from "@/components/informes/EstudioInforme";

export const dynamic = "force-dynamic";

// Un informe del Estudio. /informes/nuevo crea el borrador: con ?pedido= lo arma Nova, con ?plantilla= desde una
// plantilla y sin nada en blanco; luego redirige a /informes/{id}. ?tab=programacion|ediciones abre esa pestaña.
export default async function InformePage({ params, searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewReportes ?? canViewReportes(user.role))) redirect("/registros");

  let report = null;
  let plantilla = null;
  if (params.id !== "nuevo") {
    const res = await backendFetch(`/api/reports/${encodeURIComponent(params.id)}`);
    if (!res.ok) redirect("/informes");
    report = await res.json();
  } else if (searchParams?.plantilla) {
    const res = await backendFetch("/api/reports/plantillas");
    const { plantillas = [] } = res.ok ? await res.json() : {};
    plantilla = plantillas.find((p) => p.clave === searchParams.plantilla) || null;
  }
  const pedido = typeof searchParams?.pedido === "string" ? searchParams.pedido.slice(0, 2000) : null;
  const nombre = typeof searchParams?.nombre === "string" ? searchParams.nombre.trim().slice(0, 120) : null;
  const proposito = searchParams?.proposito === "consulta" ? "consulta" : "enviar";

  return (
    <AppShell user={user} title="Estudio de informes" subtitle={report ? report.nombre : "Nuevo informe"}>
      <EstudioInforme key={params.id} initialReport={report} plantilla={plantilla} pedido={pedido} nombre={nombre} proposito={proposito} initialTab={searchParams?.tab} />
    </AppShell>
  );
}
