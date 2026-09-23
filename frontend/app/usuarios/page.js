import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewUsuarios } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import UsuariosView from "@/components/UsuariosView";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewUsuarios(user.role)) redirect("/registros");

  const res = await backendFetch("/api/users");
  const { users } = await res.json();

  return (
    <AppShell user={user} title="Usuarios" subtitle={`${users.length} usuarios`}>
      <UsuariosView initialUsers={users} />
    </AppShell>
  );
}
