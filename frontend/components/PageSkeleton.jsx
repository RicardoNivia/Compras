// Pantallas de carga (Suspense fallback vía app/*/loading.js) mientras el
// Server Component de cada ruta resuelve la sesión y los datos. No conocen
// el usuario real todavía, así que solo replican la forma del layout.

function Bar({ w, h = 12, r = 6, style }) {
  return <div className="skeleton-bar" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

function ShellTopbar({ title }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="mark">{title}</span>
      </div>
    </header>
  );
}

export function KpiRowSkeleton({ count = 4 }) {
  return (
    <div className="kpi-row">
      {Array.from({ length: count }).map((_, i) => (
        <div className="kpi" key={i}>
          <div className="kpi-head">
            <Bar w={70} h={9} />
            <div className="kpi-ic skeleton-pulse" />
          </div>
          <Bar w={90} h={22} r={4} />
          <Bar w={110} h={10} />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ height = 220 }) {
  return (
    <div className="card">
      <Bar w={160} h={14} style={{ marginBottom: 8 }} />
      <Bar w={220} h={10} style={{ marginBottom: 16 }} />
      <div className="skeleton-pulse" style={{ height, borderRadius: 10 }} />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }) {
  return (
    <div className="table-card">
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Bar w={70} />
            <Bar w={90} />
            <Bar w="20%" />
            <Bar w={80} />
            <Bar w={60} />
            <div style={{ flex: 1 }} />
            <Bar w={70} h={20} r={999} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }) {
  return (
    <div className="user-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="user-card" key={i}>
          <div className="user-card-top">
            <div className="skeleton-pulse" style={{ width: 44, height: 44, borderRadius: "50%" }} />
          </div>
          <Bar w="70%" h={14} style={{ margin: "10px 0 6px" }} />
          <Bar w="90%" h={11} style={{ marginBottom: 14 }} />
          <Bar w={100} h={22} r={999} />
        </div>
      ))}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="agent-layout">
      <div className="agent-history">
        <Bar w="100%" h={38} r={10} />
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => <Bar key={i} w="90%" h={30} r={9} />)}
        </div>
      </div>
      <div className="agent-chat">
        <div className="agent-chat-top">
          <Bar w={220} h={36} r={10} />
        </div>
        <div className="agent-chat-scroll">
          <div className="agent-empty">
            <div className="skeleton-pulse" style={{ width: 56, height: 56, borderRadius: "50%", marginBottom: 6 }} />
            <Bar w={280} h={14} />
          </div>
        </div>
      </div>
    </div>
  );
}

// El menú lateral ya no se "skeletoniza" acá — lo monta app/(app)/layout.js
// una sola vez y persiste entre navegaciones (no depende de ningún fetch),
// así que este fallback de Suspense/loading.js solo cubre el encabezado y el
// contenido de la página específica, nunca el menú.
export default function PageSkeleton({ title, children }) {
  return (
    <>
      <ShellTopbar title={title} />
      <main>{children}</main>
    </>
  );
}
