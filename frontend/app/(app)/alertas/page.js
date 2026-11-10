import { redirect } from "next/navigation";
import Link from "next/link";
import { backendFetch } from "@/lib/backendFetch";
import { getSessionUser } from "@/lib/auth";
import { canViewAlertas, canViewNotificaciones, canCreateRecord, canViewPresupuesto } from "@/lib/roles";
import AppShell from "@/components/AppShell";
import MiDiaView from "@/components/MiDiaView";
import BandejaView from "@/components/notificaciones/BandejaView";
import NotificacionesView from "@/components/notificaciones/NotificacionesView";
import ContadorNoLeidas from "@/components/notificaciones/ContadorNoLeidas";
import SolicitudesCompraView from "@/components/SolicitudesCompraView";
import { IconClock, IconBell, IconSpark, IconBag } from "@/components/icons";

export const dynamic = "force-dynamic";

// "Alertas y notificaciones": Mi día (lo que le toca hacer hoy al usuario según su rol, ver backend/lib/pendientes.js),
// la Bandeja (lo que le llegó), Mis notificaciones (las que configura por prompt, ver docs/notificaciones-diseno.md) y
// Solicitudes de compra (lo que Bienestar pide; solo para quien puede crear compras, ver backend/lib/solicitudesCompra.js).
const TABS = [
  { key: "mi-dia", label: "Mi día", Icon: IconClock, subtitle: "Lo que te toca hacer hoy, por urgencia" },
  { key: "bandeja", label: "Bandeja", Icon: IconBell, subtitle: "Las notificaciones que te llegaron" },
  { key: "notificaciones", label: "Mis notificaciones", Icon: IconSpark, subtitle: "Configura avisos en la app y en Teams con Nova" },
  { key: "solicitudes", label: "Solicitudes de compra", Icon: IconBag, subtitle: "Lo que Bienestar pide para sus actividades" },
];

export default async function AlertasPage({ searchParams }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const puedeMiDia = user.permissions?.viewAlertas ?? canViewAlertas(user.role);
  const puedeNotif = user.permissions?.viewNotificaciones ?? canViewNotificaciones(user.role);
  const puedeSolicitudes = user.permissions?.createRecord ?? canCreateRecord(user.role);
  if (!puedeMiDia && !puedeNotif && !puedeSolicitudes) redirect("/registros");

  const visibles = TABS.filter((t) => (t.key === "mi-dia" ? puedeMiDia : t.key === "solicitudes" ? puedeSolicitudes : puedeNotif));
  const tab = visibles.find((t) => t.key === searchParams?.tab) || visibles[0];

  let data = null;
  if (tab.key === "mi-dia") {
    const res = await backendFetch("/api/pendientes");
    data = res.ok ? await res.json() : { rol: user.role, totales: { total: 0, criticos: 0, atencion: 0 }, secciones: [] };
  }

  // El contador de la pestaña sale de la misma lista; el formulario de Compras solo se carga al estar en la pestaña.
  let solicitudes = [];
  let formulario = {};
  if (puedeSolicitudes) {
    const res = await backendFetch("/api/solicitudes-compra");
    solicitudes = res.ok ? (await res.json()).solicitudes : [];
  }
  if (tab.key === "solicitudes") {
    const verPresupuesto = user.permissions?.viewPresupuesto ?? canViewPresupuesto(user.role);
    const [r, m, p, pr, a] = await Promise.all([
      backendFetch("/api/records"),
      backendFetch("/api/maestros?onlyActive=1"),
      backendFetch("/api/proveedores?onlyActive=1"),
      verPresupuesto ? backendFetch("/api/presupuestos") : Promise.resolve(null),
      backendFetch("/api/actividades"),
    ]);
    formulario = {
      records: r.ok ? (await r.json()).records : [],
      maestros: m.ok ? (await m.json()).maestros : [],
      proveedores: p.ok ? (await p.json()).proveedores : [],
      presupuestos: pr?.ok ? (await pr.json()).presupuestos : [],
      actividades: a.ok ? (await a.json()).actividades : [],
    };
  }

  return (
    <AppShell user={user} title="Alertas y notificaciones" subtitle={tab.subtitle}>
      {visibles.length > 1 && (
        <nav className="nx-tabs" role="tablist" aria-label="Secciones">
          {visibles.map((t) => (
            <Link key={t.key} href={`/alertas?tab=${t.key}`} role="tab" aria-selected={t.key === tab.key} className="nx-tab">
              <t.Icon size={15} /> {t.label}
              {t.key === "bandeja" && <ContadorNoLeidas />}
              {t.key === "solicitudes" && solicitudes.length > 0 && <span className="nx-num rojo">{solicitudes.length > 99 ? "99+" : solicitudes.length}</span>}
            </Link>
          ))}
        </nav>
      )}
      {tab.key === "mi-dia" && <MiDiaView initialData={data} user={user} />}
      {tab.key === "bandeja" && <BandejaView user={user} />}
      {tab.key === "notificaciones" && <NotificacionesView user={user} foco={Number(searchParams?.n) || null} />}
      {tab.key === "solicitudes" && <SolicitudesCompraView initialSolicitudes={solicitudes} {...formulario} />}
    </AppShell>
  );
}
