"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { canViewDashboard, canViewUsuarios, canViewAgenteIA, canViewAuditoria, canViewMaestros, canViewProveedores, canViewPresupuesto, canViewReportes, canViewAlertas, canViewRegistros, canViewNotificaciones, canViewBienestar, ROLE_LABELS } from "@/lib/roles";
import { EVENTO_NO_LEIDAS } from "@/lib/notificacionesApi";
import { MODULOS } from "@/lib/modulos";
import { useModulo } from "@/components/ModuloShell";
import {
  IconDashboard, IconTable, IconSpark, IconUsers, IconHistory, IconLayers, IconLogout, IconKey, IconMoney, IconMail,
  IconBell, IconSearch, IconBuilding, IconEye, IconCalendar, IconBag, IconHeart, IconList,
} from "@/components/icons";
import { fetchCompartidosApi } from "@/lib/api";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import CommandPalette from "@/components/CommandPalette";

// Menú compacto por módulos: un riel de íconos que se expande al pasar el mouse (sin quitarle espacio al contenido).
// Solo muestra el menú del módulo activo más el grupo "General"; el módulo se cambia desde la barra superior
// (components/SelectorModulo.jsx), que solo aparece si el rol tiene acceso a más de un módulo.
// El degradado del riel sale de --accent/--secondary, que cambian con el módulo (ver "Tema por módulo" en
// globals.css): Compras azul → turquesa, Bienestar verde → turquesa. "feature" referencia la Matriz de permisos (si
// el usuario trae user.permissions, que siempre debería, se usa eso; "show" es el respaldo de lib/roles.js).
const GRUPOS = {
  compras: [
    {
      titulo: "Operación",
      items: [
        { key: "dashboard", href: "/dashboard", label: "Dashboard de compras", Icon: IconDashboard, feature: "viewDashboard", show: canViewDashboard },
        { key: "registros", href: "/registros", label: "Registros", Icon: IconTable, feature: "viewRegistros", show: canViewRegistros },
        { key: "proveedores", href: "/proveedores", label: "Proveedores", Icon: IconBuilding, feature: "viewProveedores", show: canViewProveedores },
      ],
    },
    {
      titulo: "Planeación",
      items: [
        { key: "presupuesto", href: "/presupuesto", label: "Presupuesto", Icon: IconMoney, feature: "viewPresupuesto", show: canViewPresupuesto },
        { key: "informes", href: "/informes", label: "Informes", Icon: IconMail, feature: "viewReportes", show: canViewReportes },
        { key: "maestros", href: "/maestros", label: "Maestros", Icon: IconLayers, feature: "viewMaestros", show: canViewMaestros },
      ],
    },
  ],
  // Bienestar y Fundación van muy aparte: cada línea con su resumen, sus actividades y su cronograma.
  bienestar: [
    {
      titulo: "Bienestar",
      items: [
        { key: "bienestar", href: "/bienestar", label: "Resumen", Icon: IconDashboard, feature: "viewDashboardBienestar", show: canViewBienestar },
        { key: "bienestar-actividades", href: "/bienestar/actividades", label: "Actividades", Icon: IconList, feature: "viewBienestar", show: canViewBienestar },
        { key: "bienestar-cronograma", href: "/bienestar/cronograma", label: "Cronograma", Icon: IconCalendar, feature: "viewBienestar", show: canViewBienestar },
        { key: "bienestar-maestros", href: "/bienestar/maestros", label: "Maestros", Icon: IconLayers, feature: "viewMaestrosBienestar", show: canViewBienestar },
      ],
    },
    {
      titulo: "Fundación",
      items: [
        { key: "fundacion", href: "/bienestar/fundacion", label: "Resumen Fundación", Icon: IconDashboard, feature: "viewDashboardFundacion", show: canViewBienestar },
        { key: "fundacion-actividades", href: "/bienestar/fundacion/actividades", label: "Actividades Fundación", Icon: IconList, feature: "viewFundacion", show: canViewBienestar },
        { key: "fundacion-cronograma", href: "/bienestar/fundacion/cronograma", label: "Cronograma Fundación", Icon: IconCalendar, feature: "viewFundacion", show: canViewBienestar },
      ],
    },
  ],
};

const GENERALES = [
  { key: "alertas", href: "/alertas", label: "Alertas y notificaciones", Icon: IconBell, feature: "viewAlertas", show: canViewAlertas, alt: { feature: "viewNotificaciones", show: canViewNotificaciones } },
  { key: "agente-ia", href: "/agente-ia", label: "Nova", Icon: IconSpark, feature: "viewAgenteIA", show: canViewAgenteIA },
  { key: "usuarios", href: "/usuarios", label: "Usuarios y roles", Icon: IconUsers, feature: "viewUsuarios", show: canViewUsuarios },
  { key: "auditoria", href: "/auditoria", label: "Auditoría", Icon: IconHistory, feature: "viewAuditoria", show: canViewAuditoria },
  // Solo para administradores (no es un permiso de la Matriz: se valida el rol).
  { key: "conectar-claude", href: "/conectar-claude", label: "Conectar con Claude", Icon: IconKey, feature: null, show: (role) => role === "admin" },
];

// Todos los destinos (los usa la paleta de comandos y el chat flotante para saber en qué página está la persona).
export const ALL_NAV_ITEMS = [...Object.values(GRUPOS).flat().flatMap((g) => g.items), ...GENERALES];

const permiteA = (user, it) => (it.feature ? (user.permissions?.[it.feature] ?? it.show(user.role)) : it.show(user.role))
  || (it.alt && (user.permissions?.[it.alt.feature] ?? it.alt.show(user.role)));

// Módulos que la persona puede usar: los que tienen al menos una opción permitida por su rol (Matriz de permisos).
// { compras: "/dashboard", bienestar: "/bienestar" } — el valor es el primer destino al cambiar a ese módulo.
// Lo usan el menú y el selector de módulo de la barra superior (components/SelectorModulo.jsx).
export function modulosDelUsuario(user) {
  const out = {};
  for (const [key, grupos] of Object.entries(GRUPOS)) {
    const primero = grupos.flatMap((g) => g.items).find((it) => permiteA(user, it));
    if (primero) out[key] = primero.href;
  }
  return out;
}

export const ICONOS_MODULO = { compras: IconBag, bienestar: IconHeart };

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export default function Sidebar({ user }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const modulo = useModulo();

  // "Ver informes": solo aparece si la persona tiene informes para consultar; lleva directo a la lista (/ver-informes).
  const [hayCompartidos, setHayCompartidos] = useState(false);
  useEffect(() => {
    fetchCompartidosApi().then((r) => setHayCompartidos((r.informes || []).length > 0)).catch(() => {});
  }, [pathname]);

  const permite = (it) => permiteA(user, it);

  // Módulos que la persona puede usar (con al menos una opción permitida) y sus grupos ya filtrados.
  const menu = useMemo(() => {
    const out = {};
    for (const [key, grupos] of Object.entries(GRUPOS)) {
      const visibles = grupos.map((g) => ({ ...g, items: g.items.filter(permite) })).filter((g) => g.items.length);
      if (key === "compras" && hayCompartidos) {
        const extra = { key: "ver-informes", href: "/ver-informes", label: "Ver informes", Icon: IconEye };
        const plan = visibles.find((g) => g.titulo === "Planeación");
        if (plan) plan.items = [...plan.items, extra];
        else visibles.push({ titulo: "Planeación", items: [extra] });
      }
      if (visibles.length) out[key] = visibles;
    }
    return out;
  }, [user, hayCompartidos]); // eslint-disable-line react-hooks/exhaustive-deps
  const generales = GENERALES.filter(permite);
  const modulosVisibles = Object.keys(menu);
  const moduloMenu = menu[modulo] ? modulo : modulosVisibles[0];
  const itemsPaleta = [...Object.values(menu).flat().flatMap((g) => g.items), ...generales];

  // Punto rojo en "Alertas y notificaciones": solo notificaciones no leídas (la campana publica el número).
  const [noLeidas, setNoLeidas] = useState(0);
  useEffect(() => {
    const alCambiar = (e) => setNoLeidas(Number(e.detail) || 0);
    window.addEventListener(EVENTO_NO_LEIDAS, alCambiar);
    return () => window.removeEventListener(EVENTO_NO_LEIDAS, alCambiar);
  }, []);

  // Abrir la paleta de comandos con Ctrl/Cmd+K desde cualquier página — el
  // Sidebar vive en el layout persistente (app/(app)/layout.js), así que este
  // listener queda activo todo el tiempo sin tener que registrarlo por página.
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const enlace = (item) => {
    const { key, href, label, Icon } = item;
    return (
      <Link key={key} href={href} className={`sidebar-link${pathname === href ? " active" : ""}`} aria-current={pathname === href ? "page" : undefined}>
        <span className="sidebar-link-ic">
          <Icon size={17} />
          {key === "alertas" && noLeidas > 0 && <span className="notif-dot" aria-label={`${noLeidas} sin leer`} />}
        </span>
        <span className="label">{label}</span>
        {key === "alertas" && noLeidas > 0 && <span className="notif-badge notif-badge-menu">{noLeidas > 99 ? "99+" : noLeidas}</span>}
      </Link>
    );
  };

  return (
    <div className="sidebar-track">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="sidebar-brand-mark">S</span>
          <span className="sidebar-brand-label">Sinco · {MODULOS[moduloMenu]?.nombre || "Panel"}</span>
        </div>

        <button type="button" className="sidebar-link sidebar-search-btn" onClick={() => setPaletteOpen(true)}>
          <span className="sidebar-link-ic"><IconSearch size={15} /></span>
          <span className="label">Buscar o ir a…</span>
          <span className="sidebar-kbd">⌘K</span>
        </button>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          {(menu[moduloMenu] || []).map((g) => (
            <div key={g.titulo} className="sidebar-grupo">
              <span className="sidebar-grupo-titulo">{g.titulo}</span>
              {g.items.map(enlace)}
            </div>
          ))}
          {generales.length > 0 && (
            <div className="sidebar-grupo">
              <span className="sidebar-grupo-titulo">General</span>
              {generales.map(enlace)}
            </div>
          )}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials(user.nombre)}</div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span className="sidebar-user-name">{user.nombre}</span>
              <span className="sidebar-user-role">{user.roleLabel || ROLE_LABELS[user.role] || user.role}</span>
            </div>
          </div>

          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={() => setShowChangePassword(true)}
            title="Cambiar contraseña"
          >
            <span className="sidebar-link-ic"><IconKey size={17} /></span>
            <span className="label">Cambiar contraseña</span>
          </button>

          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
            title="Cerrar sesión"
          >
            {loggingOut ? <span className="spinner" /> : <span className="sidebar-link-ic"><IconLogout size={17} /></span>}
            <span className="label">{loggingOut ? "Saliendo…" : "Cerrar sesión"}</span>
          </button>
        </div>

        {showChangePassword && (
          <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
        )}
      </aside>

      {paletteOpen && <CommandPalette items={itemsPaleta} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
