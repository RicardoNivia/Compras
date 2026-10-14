// Esqueleto que se muestra al instante mientras el servidor carga los datos de la pantalla a la que se navega
// (el menú lateral vive en el layout y no se vuelve a montar). Reutiliza el shimmer de .skeleton-bar.
function Bloque({ w = "100%", h = 14, r = 8, style }) {
  return <div className="skeleton-bar" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export default function Loading() {
  return (
    <>
      <header className="topbar" aria-hidden="true">
        <Bloque w={180} h={18} />
      </header>
      <main aria-busy="true" aria-label="Cargando">
        <div className="kpi-row">
          {[0, 1, 2, 3].map((i) => (
            <div className="kpi" key={i} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Bloque w="55%" h={11} />
              <Bloque w="40%" h={26} r={10} />
            </div>
          ))}
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Bloque w="30%" h={16} />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 180 }}>
            {[55, 80, 40, 95, 65, 75, 50, 88].map((h, i) => (
              <Bloque key={i} w="100%" h={`${h}%`} r={8} style={{ flex: 1, animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <Bloque w="25%" h={16} />
          {[0, 1, 2, 3].map((i) => <Bloque key={i} h={34} r={8} />)}
        </div>
      </main>
    </>
  );
}
