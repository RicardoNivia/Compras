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
  if (!(user.permissions?.viewUsuarios ?? canViewUsuarios(user.role))) redirect("/registros");

  const [usersRes, permissionsRes, rolesRes] = await Promise.all([
    backendFetch("/api/users"),
    backendFetch("/api/permissions"),
    backendFetch("/api/roles"),
  ]);
  const { users } = await usersRes.json();
  const { matrix } = await permissionsRes.json();
  const { roles } = await rolesRes.json();

  return (
    <AppShell user={user} title="Usuarios" subtitle={`${users.length} usuarios`}>
      <UsuariosView initialUsers={users} initialPermissionsMatrix={matrix} initialRoles={roles} />
    </AppShell>
  );
}
