"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch } from "@/components/icons";

// Paleta de comandos (Ctrl/Cmd+K) — se abre desde el botón "Buscar o ir a…"
// del Sidebar o con el atajo de teclado (ver Sidebar.jsx). Por ahora solo
// navega entre páginas (filtradas por permiso, igual que el menú); no busca
// dentro de registros/proveedores todavía.
export default function CommandPalette({ items, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  function go(href) {
    onClose();
    router.push(href);
  }

  return (
    <div
      className="modal-overlay"
      style={{ alignItems: "flex-start", paddingTop: 110 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <IconSearch size={15} />
          <label htmlFor="cmdk-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Buscar</label>
          <input
            id="cmdk-input" ref={inputRef} type="text" value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar páginas…"
            style={{ border: "none", outline: "none", fontSize: 14.5, fontFamily: "inherit", flex: 1, background: "transparent" }}
          />
          <button type="button" className="btn small" onClick={onClose}>Esc</button>
        </div>
        <div style={{ padding: 8, maxHeight: 380, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>Sin resultados para "{query}".</div>
          ) : (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--muted)", padding: "8px 10px" }}>PÁGINAS</div>
              {filtered.map(({ key, href, label, Icon }) => (
                <button
                  key={key} type="button" onClick={() => go(href)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px",
                    borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
                    background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--page)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
