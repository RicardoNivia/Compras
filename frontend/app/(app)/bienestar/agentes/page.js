import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canEditBienestar } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import AgentesCompras from "@/components/bienestar/agentes/AgentesCompras";

export const dynamic = "force-dynamic";

// Agentes de Bienestar: asociador, compras sugeridas y cotizador. Para quien registra las compras y quien
// edita Bienestar o Fundación.
export default async function AgentesComprasPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const puede = (user.permissions?.editBienestar ?? canEditBienestar(user.role)) || user.permissions?.editFundacion;
  if (!puede) redirect("/bienestar");
  return (
    <AppShell user={user} title="Agentes" subtitle="Nova hace el trabajo pesado, tú decides">
      <AgentesCompras tabInicial={searchParams?.tab} actividadInicial={searchParams?.actividad} />
    </AppShell>
  );
}
