import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import PorResolverTesoreria from "@/components/tesoreria/PorResolverTesoreria";

export const dynamic = "force-dynamic";

// Bandeja del operador de Tesorería: lo pendiente en el orden del flujo del mes (extractos → asociar → diferencias → soportes).
export default async function Pagina() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.tesoreria) redirect("/");
  return (
    <AppShell user={user} title="Por resolver" subtitle="Lo pendiente del mes, en orden: extractos, asociar, diferencias y soportes">
      <PorResolverTesoreria acceso={user.tesoreria} />
    </AppShell>
  );
}
