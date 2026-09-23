import { backendFetch } from "@/lib/backendFetch";

// Reemplazo del antiguo lib/auth-server.js: en vez de leer la cookie y
// consultar Prisma en el propio proceso, le pregunta al backend.
export async function getSessionUser() {
  const res = await backendFetch("/api/auth/me");
  if (!res.ok) return null;
  const data = await res.json();
  return data.user;
}
