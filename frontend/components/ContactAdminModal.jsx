"use client";

export default function ContactAdminModal({ onClose }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>¿Olvidaste tu contraseña?</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p className="field full">
            Por seguridad, el restablecimiento de contraseña debe hacerlo un administrador de la aplicación.
            Contacta a tu administrador del Panel de Compras y Bienestar para que te ayude a recuperar el acceso.
          </p>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  );
}
