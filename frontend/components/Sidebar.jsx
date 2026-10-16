"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { canViewDashboard, canViewUsuarios, canViewAgenteIA, canViewAuditoria, canViewMaestros, canViewProveedores, canViewPresupuesto, canViewReportes, canViewAlertas, canViewRegistros, ROLE_LABELS } from "@/lib/roles";
import { IconDashboard, IconTable, IconSpark, IconUsers, IconHistory, IconLayers, IconLogout, IconKey, IconMoney, IconMail, IconBell, IconSearch, IconBuilding, IconEye } from "@/components/icons";
import { fetchCompartidosApi } from "@/lib/api";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import CommandPalette from "@/components/CommandPalette";

// "feature" referencia la Matriz de permisos (lib/permissions.js en el
// backend) — si el usuario trae user.permissions (siempre debería, viene de
// /api/auth/me), se usa eso; "show" queda como valor por defecto de respaldo.
export const ALL_NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard de compras", Icon: IconDashboard, feature: "viewDashboard", show: canViewDashboard },
  { key: "alertas", href: "/alertas", label: "Mi día y alertas", Icon: IconBell, feature: "viewAlertas", show: canViewAlertas },
  { key: "registros", href: "/registros", label: "Registros", Icon: IconTable, feature: null, show: canViewRegistros },
  { key: "agente-ia", href: "/agente-ia", label: "Nova", Icon: IconSpark, feature: "viewAgenteIA", show: canViewAgenteIA },
  { key: "proveedores", href: "/proveedores", label: "Proveedores", Icon: IconBuilding, feature: "viewProveedores", show: canViewProveedores },
  { key: "maestros", href: "/maestros", label: "Maestros", Icon: IconLayers, feature: "viewMaestros", show: canViewMaestros },
  { key: "presupuesto", href: "/presupuesto", label: "Presupuesto", Icon: IconMoney, feature: "viewPresupuesto", show: canViewPresupuesto },
  { key: "informes", href: "/informes", label: "Informes", Icon: IconMail, feature: "viewReportes", show: canViewReportes },
  // Solo para administradores (no es un permiso de la Matriz: se valida el rol).
  { key: "conectar-claude", href: "/conectar-claude", label: "Conectar con Claude", Icon: IconKey, feature: null, show: (role) => role === "admin" },
  { key: "usuarios", href: "/usuarios", label: "Usuarios", Icon: IconUsers, feature: "viewUsuarios", show: canViewUsuarios },
  { key: "auditoria", href: "/auditoria", label: "Auditoría", Icon: IconHistory, feature: "viewAuditoria", show: canViewAuditoria },
];

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
  // "Ver informes": solo aparece si la persona tiene informes para consultar; lleva directo a la lista (/ver-informes).
  const [hayCompartidos, setHayCompartidos] = useState(false);
  useEffect(() => {
    fetchCompartidosApi().then((r) => setHayCompartidos((r.informes || []).length > 0)).catch(() => {});
  }, [pathname]);
  const router = useRouter();

  const items = ALL_NAV_ITEMS.filter((item) => (item.feature ? (user.permissions?.[item.feature] ?? item.show(user.role)) : item.show(user.role)));

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

  return (
    <div className="sidebar-track">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="sidebar-brand-mark">S</span>
          <span className="sidebar-brand-label">Sinco · Compras</span>
        </div>

        <button type="button" className="sidebar-link sidebar-search-btn" onClick={() => setPaletteOpen(true)}>
          <span className="sidebar-link-ic"><IconSearch size={15} /></span>
          <span className="label">Buscar o ir a…</span>
          <span className="sidebar-kbd">⌘K</span>
        </button>

        <nav className="sidebar-nav" aria-label="Navegación principal">
          {items.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              className={`sidebar-link${pathname === href ? " active" : ""}`}
            >
              <span className="sidebar-link-ic">
                <Icon size={17} />
              </span>
              <span className="label">{label}</span>
            </Link>
          ))}
          {hayCompartidos && (
            <Link href="/ver-informes" className={"sidebar-link" + (pathname?.startsWith("/ver-informes") ? " active" : "")}>
              <span className="sidebar-link-ic"><IconEye size={17} /></span>
              <span className="label">Ver informes</span>
            </Link>
          )}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials(user.nombre)}</div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span className="sidebar-user-name">{user.nombre}</span>
              <span className="sidebar-user-role">{ROLE_LABELS[user.role] || user.role}</span>
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

      {paletteOpen && <CommandPalette items={items} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
