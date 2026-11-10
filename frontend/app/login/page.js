import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canViewDashboard } from "@/lib/roles";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Iniciar sesión · Panel de Compras y Bienestar" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(canViewDashboard(user.role) ? "/dashboard" : "/registros");
  return <LoginForm />;
}
