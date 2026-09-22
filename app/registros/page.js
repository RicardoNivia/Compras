import { redirect } from "next/navigation";
import { listRecords } from "@/lib/records";
import { getSessionUser } from "@/lib/auth-server";
import AppShell from "@/components/AppShell";
import RegistrosPageClient from "@/components/RegistrosPageClient";

export const dynamic = "force-dynamic";

export default async function RegistrosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const records = await listRecords();

  return (
    <AppShell user={user} title="Registros" subtitle={`${records.length} registros`}>
      <RegistrosPageClient initialRecords={records} currentUser={user} />
    </AppShell>
  );
}
