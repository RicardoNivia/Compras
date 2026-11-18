import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import RecibosConsumo from "@/components/consumo/RecibosConsumo";

export const dynamic = "force-dynamic";

// Consumo: el acceso viene de la Matriz de permisos (user.consumo de /api/auth/me). Ver backend/lib/consumo/comun.js.
// ?q= abre la tabla ya buscada (lo usa Agentes › Recibos faltantes con el número de cuenta).
export default async function Pagina({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.consumo) redirect("/");
  return (
    <AppShell user={user} title="Recibos" subtitle="Todos los recibos, uno por período">
      <RecibosConsumo acceso={user.consumo} qInicial={typeof searchParams?.q === "string" ? searchParams.q.slice(0, 100) : ""} />
    </AppShell>
  );
}
