// Esqueletos de Tesorería: la forma de cada pantalla mientras llegan los datos (shimmer de .skeleton-bar, igual que el
// resto de la app). Los usan los loading.js de cada ruta y los componentes mientras consultan.
import PageSkeleton, { KpiRowSkeleton, CardSkeleton, TableSkeleton } from "@/components/PageSkeleton";

export function Barra({ w = "100%", h = 12, r = 8, style }) {
  return <div className="skeleton-bar" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function FiltrosEsqueleto({ campos = 5, conBoton = true }) {
  return (
    <div className="card tes-filtros" aria-hidden="true">
      {Array.from({ length: campos }).map((_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, flex: i === 0 ? "2 1 200px" : "0 0 120px" }}>
          <Barra w={60} h={9} />
          <Barra h={34} r={9} />
        </div>
      ))}
      {conBoton && <Barra w={170} h={36} r={10} style={{ marginLeft: "auto" }} />}
    </div>
  );
}

export function FilasEsqueleto({ filas = 8, columnas = 6 }) {
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }} aria-hidden="true">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", animationDelay: `${i * 0.05}s` }}>
          {Array.from({ length: columnas }).map((__, j) => <Barra key={j} w={j === 1 ? "28%" : j === columnas - 1 ? 80 : 90} h={j === columnas - 1 ? 20 : 12} r={j === columnas - 1 ? 999 : 6} />)}
        </div>
      ))}
    </div>
  );
}

export function ResumenEsqueleto() {
  return (
    <>
      <div className="card-head" style={{ marginBottom: 14 }} aria-hidden="true">
        <div style={{ display: "flex", gap: 10 }}><Barra w={180} h={36} r={10} /><Barra w={110} h={36} r={10} /><Barra w={150} h={36} r={10} /></div>
        <Barra w={190} h={38} r={10} />
      </div>
      <KpiRowSkeleton count={5} />
      <CardSkeleton height={240} />
      <div className="tes-dos" style={{ marginTop: 14 }}><CardSkeleton height={200} /><CardSkeleton height={200} /></div>
    </>
  );
}

export function ConciliacionEsqueleto() {
  return (
    <div className="tes-vista" aria-hidden="true">
      <div className="ag-cabeza">
        <div className="ag-cabeza-top">
          <div className="skeleton-pulse" style={{ width: 46, height: 46, borderRadius: 14 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Barra w={220} h={18} /><Barra w="70%" h={11} /></div>
          <Barra w={240} h={38} r={10} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>{[0, 1, 2, 3].map((i) => <Barra key={i} h={38} r={12} />)}</div>
      </div>
      <div className="tca-cuentas">{[0, 1, 2, 3, 4, 5].map((i) => <Barra key={i} h={56} r={14} />)}</div>
      <div className="tca-inicio"><Barra h={230} r={20} /><Barra h={230} r={20} /></div>
    </div>
  );
}

export function ReportesEsqueleto() {
  return (
    <div className="tes-vista" aria-hidden="true">
      <FiltrosEsqueleto campos={5} />
      <div className="table-card">
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}><Barra w={240} h={14} /><Barra w="45%" h={10} /></div>
        <FilasEsqueleto filas={12} columnas={8} />
      </div>
    </div>
  );
}

export function MaestrosEsqueleto() {
  return (
    <div className="maestros-shell" aria-hidden="true">
      <aside className="maestros-nav" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Barra w={150} h={11} />
        {[0, 1, 2, 3].map((i) => <Barra key={i} h={36} r={10} />)}
      </aside>
      <section className="maestros-main" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><Barra w={260} h={36} r={10} /><Barra w={130} h={36} r={10} /></div>
        <FilasEsqueleto filas={8} columnas={5} />
      </section>
    </div>
  );
}

export function PaginaTesoreria({ titulo, children }) {
  return <PageSkeleton title={titulo}>{children}</PageSkeleton>;
}

export { KpiRowSkeleton, CardSkeleton, TableSkeleton };
