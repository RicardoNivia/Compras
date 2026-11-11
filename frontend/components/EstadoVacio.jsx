// Estado vacío de la app (mismo diseño que cualquier `.empty` de globals.css): ilustración con el color del módulo,
// título, texto y, si aplica, la acción que llena la pantalla. Para los casos simples basta <div className="empty">…</div>;
// este componente es para cuando hay título, ícono propio o un botón.
// icono: nodo (p. ej. <IconMoney size={22} />); accion: nodo (botón o Link); compacto: dentro de modales y listas cortas.
export default function EstadoVacio({ titulo, children, icono = null, accion = null, compacto = false }) {
  return (
    <div className={`empty empty-rico${icono ? " con-icono" : ""}${compacto ? " compacta" : ""}`} role="status">
      {icono && <span className="empty-ic" aria-hidden="true">{icono}</span>}
      {titulo && <strong className="empty-t">{titulo}</strong>}
      {children && <span className="empty-txt">{children}</span>}
      {accion && <div className="empty-accion">{accion}</div>}
    </div>
  );
}
