import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import VisorCompartido from "@/components/informes/VisorCompartido";

export const dynamic = "force-dynamic";

// Un informe compartido, solo lectura, recalculado al abrirlo. Sin acceso → vuelve a la lista.
export default async function VerInformePage({ params }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const res = await backendFetch(`/api/reports/compartidos/${encodeURIComponent(params.id)}`);
  if (!res.ok) redirect("/ver-informes");
  const informe = await res.json();

  return (
    <AppShell user={user} title={informe.nombre} subtitle="Ver informes">
      <VisorCompartido informe={informe} />
    </AppShell>
  );
}
