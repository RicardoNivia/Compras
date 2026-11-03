// El menú lateral ya no vive acá — lo monta app/(app)/layout.js una sola vez
// para toda la sesión de navegación, así nunca se vuelve a montar ni parpadea
// con un skeleton al cambiar de página (el menú no depende de ningún fetch).
// Este componente solo pone el encabezado (título/subtítulo/acciones) y el
// contenido de la página. "user" lo usa el selector de módulo (qué módulos puede ver).
// La campana de notificaciones va siempre a la derecha; se oculta sola si la persona no tiene el permiso.
// El selector de módulo (Compras / Bienestar) va a la izquierda del título y solo aparece si el rol tiene más de uno.
import CampanaNotificaciones from "@/components/CampanaNotificaciones";
import SelectorModulo from "@/components/SelectorModulo";

export default function AppShell({ user, title, subtitle, actions, children }) {
  return (
    <>
      <header className="topbar">
        <SelectorModulo user={user} />
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
