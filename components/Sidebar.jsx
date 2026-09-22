"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { canViewDashboard, canViewUsuarios, canViewAgenteIA, ROLE_LABELS } from "@/lib/roles";

const ALL_NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard de compras", icon: "📊", show: canViewDashboard },
  { key: "registros", href: "/registros", label: "Registros", icon: "📋", show: () => true },
  { key: "agente-ia", href: "/agente-ia", label: "Agente IA", icon: "✦", show: canViewAgenteIA },
  { key: "usuarios", href: "/usuarios", label: "Usuarios", icon: "👤", show: canViewUsuarios },
];

export default function Sidebar({ user }) {
  const [hovering, setHovering] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const expanded = hovering;

  const items = ALL_NAV_ITEMS.filter((item) => item.show(user.role));

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
    <aside
      className={`sidebar${expanded ? "" : " collapsed"}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="sidebar-head">
        <span className="sidebar-brand-mark">S</span>
        {expanded && <span className="sidebar-brand-label">Sinco · Compras</span>}
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`sidebar-link${pathname === item.href ? " active" : ""}`}
            title={expanded ? undefined : item.label}
          >
            <span className="sidebar-link-ic">{item.icon}</span>
            {expanded && <span className="label">{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="sidebar-foot">
        {expanded && (
          <div className="sidebar-user">
            <span className="sidebar-user-name">{user.nombre}</span>
            <span className="sidebar-user-role">{ROLE_LABELS[user.role] || user.role}</span>
          </div>
        )}

        <button
          type="button"
          className="sidebar-logout-btn"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Cerrar sesión"
        >
          {loggingOut ? <span className="spinner" /> : <span className="sidebar-link-ic">⏻</span>}
          {expanded && <span className="label">{loggingOut ? "Saliendo…" : "Cerrar sesión"}</span>}
        </button>
      </div>
    </aside>
  );
}
