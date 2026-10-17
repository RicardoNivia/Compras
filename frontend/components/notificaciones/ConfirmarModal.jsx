"use client";

import { Portal } from "@/components/notificaciones/ui";

import { useEffect, useRef, useState } from "react";

// Confirmación con el estilo de la app (en lugar de window.confirm).
// pedido: { titulo, mensaje, detalle?, boton, peligro?, onOk: async () => {} }
export default function ConfirmarModal({ pedido, onClose }) {
  const [enCurso, setEnCurso] = useState(false);
  const okRef = useRef(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !enCurso) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enCurso, onClose]);

  async function confirmar() {
    setEnCurso(true);
    try {
      await pedido.onOk();
    } finally {
      setEnCurso(false);
      onClose();
    }
  }

  return (
    <Portal>
    <div className="modal-overlay" onClick={() => !enCurso && onClose()}>
      <div className="modal notif-confirmar" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="notif-confirmar-titulo">
        <div className="modal-head">
          <h3 id="notif-confirmar-titulo">{pedido.titulo}</h3>
        </div>
        <div className="notif-modal-body">
          <p style={{ margin: 0 }}>{pedido.mensaje}</p>
          {pedido.detalle && <p className="count-note" style={{ margin: 0 }}>{pedido.detalle}</p>}
        </div>
        <div className="modal-foot">
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={enCurso}>Cancelar</button>
          <button type="button" ref={okRef} className={`btn ${pedido.peligro ? "btn-danger-solid" : "btn-primary"}`} onClick={confirmar} disabled={enCurso}>
            {enCurso ? <span className="spinner" /> : null} {pedido.boton}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
