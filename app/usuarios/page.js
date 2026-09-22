import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-server";
import { canViewUsuarios } from "@/lib/roles";
import { listUsers } from "@/lib/users";
import AppShell from "@/components/AppShell";
import UsuariosView from "@/components/UsuariosView";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewUsuarios(user.role)) redirect("/registros");

  const users = await listUsers();

  return (
    <AppShell user={user} title="Usuarios" subtitle={`${users.length} usuarios`}>
      <UsuariosView initialUsers={users} />
    </AppShell>
  );
}
