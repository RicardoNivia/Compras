import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewAgentesCompras, canViewAnomaliasCompras, canViewPresupuesto } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import AgentesComprasView from "@/components/compras/agentes/AgentesComprasView";

export const dynamic = "force-dynamic";

// Agentes de Compras: revisor, proveedor y precio, cotizador, verificar factura (viewAgentesCompras), vigía de
// presupuesto (viewPresupuesto) y detector de anomalías (viewAnomaliasCompras).
export default async function AgentesComprasPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const p = user.permissions || {};
  const permisos = {
    agentes: p.viewAgentesCompras ?? canViewAgentesCompras(user.role),
    presupuesto: p.viewPresupuesto ?? canViewPresupuesto(user.role),
    anomalias: p.viewAnomaliasCompras ?? canViewAnomaliasCompras(user.role),
  };
  if (!permisos.agentes && !permisos.anomalias) redirect("/");
  return (
    <AppShell user={user} title="Agentes" subtitle="El sistema calcula, Nova explica y tú decides">
      <AgentesComprasView permisos={permisos} tabInicial={searchParams?.tab} />
    </AppShell>
  );
}
