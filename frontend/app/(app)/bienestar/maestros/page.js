import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewMaestrosBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MaestrosView from "@/components/MaestrosView";

export const dynamic = "force-dynamic";

// Los maestros de Bienestar y Fundación dentro de su módulo (con su tema). También se ven en /maestros si el rol tiene ambos.
export default async function MaestrosBienestarPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewMaestrosBienestar ?? canViewMaestrosBienestar(user.role))) redirect("/bienestar");
  const res = await backendFetch("/api/maestros");
  const { maestros } = await res.json();

  return (
    <AppShell user={user} title="Maestros de Bienestar" subtitle="Responsables, áreas, motivos de inasistencia, unidades y escala de calificación">
      <MaestrosView initialMaestros={maestros} modulos={{ Bienestar: true }} initialSeccion={searchParams?.seccion || null} />
    </AppShell>
  );
}
