import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AgentesConsumo from "@/components/consumo/AgentesConsumo";

export const dynamic = "force-dynamic";

// Consumo: el acceso viene de la Matriz de permisos (user.consumo de /api/auth/me). Ver backend/lib/consumo/agentes.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.consumo) redirect("/");
  return (
    <AppShell user={user} title="Agentes" subtitle="Recibos que faltan, hallazgos y reclamaciones; tú decides">
      <Suspense fallback={null}><AgentesConsumo acceso={user.consumo} /></Suspense>
    </AppShell>
  );
}
