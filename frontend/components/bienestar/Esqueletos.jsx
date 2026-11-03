// Esqueletos de carga del módulo de Bienestar: tienen la forma de lo que va a aparecer, para que la pantalla no salte al
// llegar los datos. Reutilizan el brillo de .skeleton-bar. Los usan las páginas (loading.js, mientras llega el servidor)
// y las vistas (mientras responde la API).
export function Bloque({ w = "100%", h = 14, r = 8, style }) {
  return <div className="skeleton-bar" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

function Contenedor({ etiqueta, className = "", children }) {
  return <div className={`esq ${className}`} role="status" aria-busy="true" aria-label={etiqueta}>{children}</div>;
}

const Tarjeta = ({ children, style }) => <div className="esq-tarjeta" style={style}>{children}</div>;

export function EsqueletoKpis({ n = 6 }) {
  return (
    <div className="esq-kpis">
      {Array.from({ length: n }).map((_, i) => (
        <Tarjeta key={i}>
          <Bloque w="60%" h={11} />
          <Bloque w="45%" h={26} r={10} />
          <Bloque w="80%" h={10} />
        </Tarjeta>
      ))}
    </div>
  );
}

function BarrasGrafica({ alto = 220 }) {
  return (
    <div className="esq-barras" style={{ height: alto }}>
      {[30, 55, 45, 70, 40, 90, 60, 80, 50, 65, 25, 35].map((h, i) => (
        <Bloque key={i} h={`${h}%`} r={7} style={{ flex: 1, animationDelay: `${i * 0.06}s` }} />
      ))}
    </div>
  );
}

// Dashboard: lo que hay debajo de los controles de período, que siguen disponibles mientras carga.
export function EsqueletoResumen() {
  return (
    <Contenedor etiqueta="Cargando el resumen">
      <EsqueletoKpis />
      <Tarjeta><Bloque w="28%" h={16} /><Bloque w="45%" h={11} /><BarrasGrafica /></Tarjeta>
      <EsqueletoAnalisis />
      <div className="esq-dos">
        {[0, 1].map((i) => <Tarjeta key={i}><Bloque w="45%" h={16} />{[90, 70, 55, 40].map((w) => <Bloque key={w} w={`${w}%`} h={14} />)}</Tarjeta>)}
      </div>
    </Contenedor>
  );
}

export function EsqueletoAnalisis() {
  return (
    <Tarjeta>
      <Bloque w="30%" h={15} />
      <Bloque w="60%" h={18} />
      <Bloque h={11} />
      <Bloque w="85%" h={11} />
      <div className="esq-tres">{[0, 1, 2].map((i) => <Bloque key={i} h={58} r={10} />)}</div>
    </Tarjeta>
  );
}

export function EsqueletoTabla({ filas = 8, etiqueta = "Cargando la tabla" }) {
  return (
    <Contenedor etiqueta={etiqueta}>
      <Tarjeta style={{ padding: 0, gap: 0 }}>
        <div className="esq-fila cabeza">{[18, 34, 14, 18, 16].map((w, i) => <Bloque key={i} w={`${w}%`} h={11} />)}</div>
        {Array.from({ length: filas }).map((_, i) => (
          <div className="esq-fila" key={i}>{[18, 34, 14, 18, 16].map((w, k) => <Bloque key={k} w={`${w}%`} h={13} style={{ animationDelay: `${i * 0.05}s` }} />)}</div>
        ))}
      </Tarjeta>
    </Contenedor>
  );
}

export function EsqueletoActividades() {
  return (
    <Contenedor etiqueta="Cargando las actividades">
      <EsqueletoKpis n={4} />
      <EsqueletoTabla />
    </Contenedor>
  );
}

export function EsqueletoFicha() {
  return (
    <Contenedor etiqueta="Cargando la actividad">
      <Bloque w={110} h={12} />
      <Bloque w="42%" h={28} r={10} />
      <div className="esq-chips">{[90, 80, 100].map((w) => <Bloque key={w} w={w} h={24} r={99} />)}</div>
      <EsqueletoKpis n={5} />
      <Bloque w="55%" h={38} r={10} />
      <EsqueletoAnalisis />
    </Contenedor>
  );
}

export function EsqueletoFotos() {
  return (
    <Contenedor etiqueta="Cargando las fotos">
      <div className="fotos-grid">{Array.from({ length: 8 }).map((_, i) => <Bloque key={i} h={128} r={12} style={{ animationDelay: `${i * 0.05}s` }} />)}</div>
    </Contenedor>
  );
}

export function EsqueletoLista({ filas = 3, etiqueta = "Cargando" }) {
  return (
    <Contenedor etiqueta={etiqueta}>
      {Array.from({ length: filas }).map((_, i) => <Bloque key={i} h={44} r={10} style={{ animationDelay: `${i * 0.08}s` }} />)}
    </Contenedor>
  );
}

export function EsqueletoCronograma() {
  return (
    <Contenedor etiqueta="Cargando el cronograma">
      <div className="esq-oscuro">
        <div className="esq-kpis">{[0, 1, 2, 3].map((i) => <Bloque key={i} h={70} r={14} />)}</div>
        <div className="esq-linea"><Bloque h={6} r={99} /></div>
      </div>
    </Contenedor>
  );
}

export function EsqueletoFormulario() {
  return (
    <Contenedor etiqueta="Cargando el formulario">
      <Bloque w="38%" h={30} r={10} />
      <div className="esq-cuerpo-form">
        <div className="esq">
          <div className="esq-tres cuatro">{[0, 1, 2, 3].map((i) => <Bloque key={i} h={54} r={14} />)}</div>
          <Tarjeta>
            <Bloque w="30%" h={12} /><Bloque h={50} r={10} />
            <Bloque w="22%" h={12} /><div className="esq-dos">{[0, 1].map((i) => <Bloque key={i} h={60} r={12} />)}</div>
            <Bloque w="26%" h={12} /><Bloque h={42} r={10} />
          </Tarjeta>
        </div>
        <Tarjeta><Bloque w="35%" h={20} r={99} /><Bloque w="80%" h={18} />{[0, 1, 2, 3, 4].map((i) => <Bloque key={i} h={12} />)}</Tarjeta>
      </div>
    </Contenedor>
  );
}

// La barra superior vacía mientras carga la página (loading.js va por fuera de AppShell).
export function PaginaCargando({ children }) {
  return (
    <>
      <header className="topbar" aria-hidden="true"><Bloque w={180} h={18} /></header>
      <main aria-busy="true">{children}</main>
    </>
  );
}
