import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import RegistrosPageClient from "@/components/RegistrosPageClient";

export const dynamic = "force-dynamic";

export default async function RegistrosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [recordsRes, maestrosRes] = await Promise.all([
    backendFetch("/api/records"),
    backendFetch("/api/maestros?onlyActive=1"),
  ]);
  const { records } = await recordsRes.json();
  const { maestros } = await maestrosRes.json();

  return (
    <AppShell user={user} title="Registros" subtitle={`${records.length} registros`}>
      <RegistrosPageClient initialRecords={records} currentUser={user} maestros={maestros} />
    </AppShell>
  );
}
