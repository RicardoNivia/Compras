"use client";

import InformeMensual from "@/components/proveedores/InformeMensual";

// Informe mensual dentro de una ventana modal (botón "Informe mensual" del maestro).
export default function InformeMensualModal({ onClose }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal prov-modal prov-modal-wide" role="dialog" aria-modal="true" aria-label="Informe mensual de proveedores">
        <div className="modal-head">
          <div>
            <h3>Informe mensual de proveedores</h3>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nuevos, actualizados y cambios realizados en el mes</p>
          </div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="prov-modal-body">
          <InformeMensual />
        </div>
      </div>
    </div>
  );
}
