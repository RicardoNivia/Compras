"use client";

import { useEffect } from "react";
import { fmtDateDisplay, fmtDateTime, fmtPesos } from "@/lib/format";
import { getDiasInfo } from "@/lib/diasInfo";

function estadoPillClass(estado) {
  if (estado === "Ejecutado") return "good";
  if (estado === "Proceso") return "warning";
  if (estado === "Anulado") return "critical";
  return "muted";
}

function legalizacionPillClass(v) {
  if (v === "ACTA") return "good";
  if (v === "OC") return "warning";
  if (v === "N/A") return "muted";
  return "muted";
}

function Item({ label, children, full }) {
  return (
    <div className={`detail-item${full ? " full" : ""}`}>
      <div className="dlabel">{label}</div>
      <div className="dvalue">{children}</div>
    </div>
  );
}

function EmptyOr({ value }) {
  if (value === null || value === undefined || value === "") {
    return <span className="empty-val">—</span>;
  }
  return value;
}

export default function DetailModal({ record, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!record) return null;
  const diasInfo = getDiasInfo(record);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal detail-modal">
        <div className="modal-head">
          <h3>Detalle de la solicitud</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="detail-grid">
          <Item label="Fecha de solicitud">{fmtDateDisplay(record.fechaSolicitud)}</Item>
          <Item label="Fecha de entrega">{fmtDateDisplay(record.fechaEntrega)}</Item>

          <Item label="Días hábiles">
            <span className={`pill ${diasInfo.severity}`}>{diasInfo.label}</span>
          </Item>
          <Item label="Estado de compra">
            <span className={`pill ${estadoPillClass(record.estado)}`}><EmptyOr value={record.estado} /></span>
          </Item>

          <Item label="Área"><EmptyOr value={record.area} /></Item>
          <Item label="Responsable"><EmptyOr value={record.responsable} /></Item>

          <Item label="Categoría"><EmptyOr value={record.categoria} /></Item>
          <Item label="Medio de pago"><EmptyOr value={record.medioPago} /></Item>

          <Item label="Descripción" full><EmptyOr value={record.descripcion} /></Item>

          <Item label="Nit"><EmptyOr value={record.nit} /></Item>
          <Item label="Proveedor"><EmptyOr value={record.proveedor} /></Item>
          <Item label="Actividad de Bienestar"><EmptyOr value={record.actividad} /></Item>
          <Item label="Licitación"><EmptyOr value={record.licitacion} /></Item>

          <Item label="Estado legalización">
            <span className={`pill ${legalizacionPillClass(record.estadoLegalizacion)}`}>
              <EmptyOr value={record.estadoLegalizacion} />
            </span>
          </Item>
          <Item label="FE / referencia"><span className="mono"><EmptyOr value={record.fe} /></span></Item>

          <Item label="Valor + IVA">{fmtPesos(record.valorConIva)}</Item>
          <Item label="Valor sin IVA">{fmtPesos(record.valorSinIva)}</Item>

          <Item label="Valor cotizado">{fmtPesos(record.valorCot)}</Item>
          <Item label="Radicado">{record.radicado ? "Sí" : "No"}</Item>
          <Item label="Calificación">
            {record.calificacion ? "★".repeat(record.calificacion.estrellas) + "☆".repeat(5 - record.calificacion.estrellas) : "Sin calificar"}
          </Item>

          {record.moneda === "USD" && (
            <>
              <Item label="Moneda original">Dólares (USD)</Item>
              <Item label="Valor en USD / TRM">
                {record.valorUsd != null ? `US$${record.valorUsd.toLocaleString("es-CO")}` : "—"}
                {record.trm != null ? ` · TRM ${record.trm.toLocaleString("es-CO")}` : ""}
              </Item>
            </>
          )}

          <Item label="Observaciones" full><EmptyOr value={record.observaciones} /></Item>

          <Item label="Fecha de registro en el sistema">{fmtDateTime(record.fechaRegistro)}</Item>
        </div>
      </div>
    </div>
  );
}
