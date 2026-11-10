import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import HistoriasFundacion from "@/components/bienestar/historias/HistoriasFundacion";

export const dynamic = "force-dynamic";

// Historias de Conectando Corazones: las jornadas de Fundación contadas como presentación (fotos, personas y voces).
export default async function FundacionHistoriasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(user.permissions?.viewFundacion ?? canViewBienestar(user.role))) redirect(user.permissions?.viewDashboardFundacion ? "/bienestar/fundacion" : "/registros");
  return (
    <AppShell user={user} title="Fundación · Historias" subtitle="Las jornadas de Conectando Corazones, contadas con sus fotos y sus voces">
      <HistoriasFundacion />
    </AppShell>
  );
}
