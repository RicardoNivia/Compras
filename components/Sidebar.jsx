"use client";

import { useEffect, useRef, useState } from "react";

const NAV_ITEMS = [
  { key: "savings", label: "Dashboard de compras", icon: "📊" },
  { key: "registros", label: "Registros", icon: "📋" },
];

export default function Sidebar({ activeTab, setActiveTab }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const asideRef = useRef(null);
  const expanded = !collapsed || hovering;

  // Colapsar implícitamente al hacer click fuera del menú.
  useEffect(() => {
    if (collapsed) return;
    function onDocClick(e) {
      if (asideRef.current && !asideRef.current.contains(e.target)) {
        setCollapsed(true);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [collapsed]);

  return (
    <aside
      ref={asideRef}
      className={`sidebar${expanded ? "" : " collapsed"}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="sidebar-head">
        <span className="sidebar-brand-mark">S</span>
        {expanded && <span className="sidebar-brand-label">Sinco · Compras</span>}
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sidebar-link${activeTab === item.key ? " active" : ""}`}
            onClick={() => setActiveTab(item.key)}
            title={expanded ? undefined : item.label}
            aria-current={activeTab === item.key ? "page" : undefined}
          >
            <span className="sidebar-link-ic">{item.icon}</span>
            {expanded && <span className="label">{item.label}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Fijar expandido" : "Colapsar menú"}
        >
          <span className="sidebar-link-ic">{expanded ? "«" : "»"}</span>
          {expanded && <span className="label">{collapsed ? "Fijar expandido" : "Colapsar"}</span>}
        </button>
      </div>
    </aside>
  );
}
