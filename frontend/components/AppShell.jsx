"use client";

import Sidebar from "@/components/Sidebar";

export default function AppShell({ user, title, subtitle, children }) {
  return (
    <div className="app-shell">
      <Sidebar user={user} />
      <div className="app-main">
        <header className="topbar">
          <div className="brand">
            <span className="mark">{title}</span>
            {subtitle && (
              <>
                <span className="sep">·</span>
                <span className="sub">{subtitle}</span>
              </>
            )}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
