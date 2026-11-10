import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import ConectarClaudeView from "@/components/ConectarClaudeView";

export const dynamic = "force-dynamic";

// "Conectar con Claude": tokens personales para usar el servidor MCP del panel (ver backend/lib/mcpServer.js).
export default async function ConectarClaudePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/registros"); // solo administradores

  const res = await backendFetch("/api/tokens");
  const { tokens } = res.ok ? await res.json() : { tokens: [] };

  return (
    <AppShell user={user} title="Conectar con Claude" subtitle="Consulta los datos del panel desde tu propio Claude">
      <ConectarClaudeView initialTokens={tokens} user={user} />
    </AppShell>
  );
}
