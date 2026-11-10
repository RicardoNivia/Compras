"use client";

import ProveedorDetalle from "@/components/proveedores/ProveedorDetalle";

// Ventana modal con la ficha del proveedor (checklist, histórico, datos y acciones).
// Se abre con el botón "Ver detalle" de cada fila del maestro.
export default function ProveedorDetalleModal({ proveedorNit, catalogos, canEdit, onClose, onChanged }) {
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal prov-modal" role="dialog" aria-modal="true" aria-label="Detalle del proveedor">
        <div className="modal-head">
          <h3>Detalle del proveedor</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="prov-modal-body">
          <ProveedorDetalle
            proveedorNit={proveedorNit}
            catalogos={catalogos}
            canEdit={canEdit}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}
