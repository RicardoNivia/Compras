// El menú lateral ya no vive acá — lo monta app/(app)/layout.js una sola vez
// para toda la sesión de navegación, así nunca se vuelve a montar ni parpadea
// con un skeleton al cambiar de página (el menú no depende de ningún fetch).
// Este componente solo pone el encabezado (título/subtítulo/acciones) y el
// contenido de la página — "user" se mantiene como prop aceptada por
// compatibilidad con los llamadores existentes, pero ya no se usa acá.
export default function AppShell({ title, subtitle, actions, children }) {
  return (
    <>
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
        {actions && (
          <>
            <div className="spacer" />
            {actions}
          </>
        )}
      </header>
      <main>{children}</main>
    </>
  );
}
