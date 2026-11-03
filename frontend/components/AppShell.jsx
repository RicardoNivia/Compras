// El menú lateral ya no vive acá — lo monta app/(app)/layout.js una sola vez
// para toda la sesión de navegación, así nunca se vuelve a montar ni parpadea
// con un skeleton al cambiar de página (el menú no depende de ningún fetch).
// Este componente solo pone el encabezado (título/subtítulo/acciones) y el
// contenido de la página. El selector de módulo (Compras / Bienestar) está en el menú lateral.
// La campana de notificaciones va siempre a la derecha; se oculta sola si la persona no tiene el permiso.
import CampanaNotificaciones from "@/components/CampanaNotificaciones";

export default function AppShell({ user, title, subtitle, actions, children }) {
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
        <div className="spacer" />
        {actions}
        <CampanaNotificaciones />
      </header>
      <main>{children}</main>
    </>
  );
}
