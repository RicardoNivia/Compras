import { redirect } from "next/navigation";
import Link from "next/link";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewAlertas, canViewNotificaciones } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MiDiaView from "@/components/MiDiaView";
import BandejaView from "@/components/notificaciones/BandejaView";
import NotificacionesView from "@/components/notificaciones/NotificacionesView";
import ContadorNoLeidas from "@/components/notificaciones/ContadorNoLeidas";
import { IconClock, IconBell, IconSpark } from "@/components/icons";

export const dynamic = "force-dynamic";

// "Alertas y notificaciones": Mi día (lo que le toca hacer hoy al usuario según su rol, ver backend/lib/pendientes.js),
// la Bandeja (lo que le llegó) y Mis notificaciones (las que configura por prompt, ver docs/notificaciones-diseno.md).
const TABS = [
  { key: "mi-dia", label: "Mi día", Icon: IconClock, subtitle: "Lo que te toca hacer hoy, por urgencia" },
  { key: "bandeja", label: "Bandeja", Icon: IconBell, subtitle: "Las notificaciones que te llegaron" },
  { key: "notificaciones", label: "Mis notificaciones", Icon: IconSpark, subtitle: "Configura avisos en la app y en Teams con Nova" },
];

export default async function AlertasPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const puedeMiDia = user.permissions?.viewAlertas ?? canViewAlertas(user.role);
  const puedeNotif = user.permissions?.viewNotificaciones ?? canViewNotificaciones(user.role);
  if (!puedeMiDia && !puedeNotif) redirect("/registros");

  const visibles = TABS.filter((t) => (t.key === "mi-dia" ? puedeMiDia : puedeNotif));
  const tab = visibles.find((t) => t.key === searchParams?.tab) || visibles[0];

  let data = null;
  if (tab.key === "mi-dia") {
    const res = await backendFetch("/api/pendientes");
    data = res.ok ? await res.json() : { rol: user.role, totales: { total: 0, criticos: 0, atencion: 0 }, secciones: [] };
  }

  return (
    <AppShell user={user} title="Alertas y notificaciones" subtitle={tab.subtitle}>
      {visibles.length > 1 && (
        <nav className="nx-tabs" role="tablist" aria-label="Secciones">
          {visibles.map((t) => (
            <Link key={t.key} href={`/alertas?tab=${t.key}`} role="tab" aria-selected={t.key === tab.key} className="nx-tab">
              <t.Icon size={15} /> {t.label}
              {t.key === "bandeja" && <ContadorNoLeidas />}
            </Link>
          ))}
        </nav>
      )}
      {tab.key === "mi-dia" && <MiDiaView initialData={data} user={user} />}
      {tab.key === "bandeja" && <BandejaView user={user} />}
      {tab.key === "notificaciones" && <NotificacionesView user={user} foco={Number(searchParams?.n) || null} />}
    </AppShell>
  );
}
