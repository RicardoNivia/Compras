import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewReportes } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import EstudioInicio from "@/components/informes/EstudioInicio";

export const dynamic = "force-dynamic";

// Estudio de informes: pedirle un informe a Nova, empezar con una plantilla, ver los informes programados y los
// que están listos para enviar ("Lo envío yo").
export default async function InformesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewReportes ?? canViewReportes(user.role))) redirect("/registros");

  const [rRes, pRes, eRes] = await Promise.all([
    backendFetch("/api/reports"),
    backendFetch("/api/reports/plantillas"),
    backendFetch("/api/reports/por-enviar"),
  ]);
  const { reports = [] } = rRes.ok ? await rRes.json() : {};
  const { plantillas = [] } = pRes.ok ? await pRes.json() : {};
  const { ediciones = [] } = eRes.ok ? await eRes.json() : {};

  return (
    <AppShell user={user} title="Estudio de informes" subtitle="Crea, programa y envía informes con Nova">
      <EstudioInicio initialReports={reports} plantillas={plantillas} initialPorEnviar={ediciones} />
    </AppShell>
  );
}
