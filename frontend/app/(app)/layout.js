import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ModuloShell from "@/components/ModuloShell";
import FloatingAgentChat from "@/components/FloatingAgentChat";
import AvisosEnVivo from "@/components/notificaciones/AvisosEnVivo";
import { canViewNotificaciones } from "@/lib/roles";
import { COOKIE_MODULO } from "@/lib/modulos";

export const dynamic = "force-dynamic";

// Envuelve todas las páginas autenticadas (Dashboard, Registros, Agente IA,
// etc. — ver la carpeta de este grupo de rutas). El menú lateral vive acá en
// vez de en cada page.js: un layout persiste entre navegaciones del lado del
// cliente dentro del mismo grupo, así el Sidebar nunca se vuelve a montar ni
// muestra su loading.js al cambiar de página — solo el contenido (hijo de
// este layout) se reemplaza por el loading.js de esa ruta mientras carga.
// Cada página sigue validando su propio permiso específico (viewDashboard,
// viewReportes, etc.) y redirigiendo si no aplica; acá solo se valida sesión.
// El módulo (Compras / Bienestar) define el menú y el color del tema: ver ModuloShell. La cookie "modulo" da el
// último módulo en el servidor para que nada parpadee al cargar.
export default async function AppLayout({ children }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const jar = cookies();

  return (
    <ModuloShell moduloInicial={jar.get(COOKIE_MODULO)?.value}>
      <Sidebar user={user} />
      <div className="app-main">{children}</div>
      <FloatingAgentChat user={user} />
      {(user.permissions?.viewNotificaciones ?? canViewNotificaciones(user.role)) && <AvisosEnVivo />}
    </ModuloShell>
  );
}
