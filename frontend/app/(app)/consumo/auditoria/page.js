import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AuditoriaConsumo from "@/components/consumo/AuditoriaConsumo";

export const dynamic = "force-dynamic";

// Consumo: el acceso viene de la Matriz de permisos (user.consumo de /api/auth/me). Ver backend/lib/consumo/comun.js.
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.consumo) redirect("/");
  return (
    <AppShell user={user} title="Auditoría y hallazgos" subtitle="Lo que el contador revisaría en los recibos de cada sede">
      <Suspense fallback={null}><AuditoriaConsumo acceso={user.consumo} /></Suspense>
    </AppShell>
  );
}
