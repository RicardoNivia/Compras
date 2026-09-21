"use client";

import { useEffect, useMemo, useState } from "react";
import { getDiasInfo } from "@/lib/diasInfo";
import { createRecordApi, updateRecordApi, deleteRecordApi } from "@/lib/api";

const ESTADOS = ["Pendiente", "Proceso", "Ejecutado", "Anulado"];
const MEDIOS_PAGO = ["TRANSFER", "T.C", "C.M", "ANTICIPO", "ANTICIPO - TRANSFER"];
const ESTADOS_LEGALIZACION = ["", "ACTA", "OC", "N/A"];

function uniqueSorted(records, field) {
  const set = new Set();
  for (const r of records) {
    if (r[field]) set.add(r[field]);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

const emptyForm = {
  fechaSolicitud: "",
  fechaEntrega: "",
  area: "",
  responsable: "",
  estado: "Pendiente",
  categoria: "",
  descripcion: "",
  medioPago: "",
  proveedor: "",
  licitacion: "",
  estadoLegalizacion: "",
  fe: "",
  valorConIva: "",
  valorSinIva: "",
  valorCot: "",
  observaciones: "",
};

export default function RecordModal({ record, records, onClose, onSaved, onDeleted }) {
  const isEdit = !!record;
  const [form, setForm] = useState(() => (record ? { ...emptyForm, ...record } : emptyForm));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const areaOptions = useMemo(() => uniqueSorted(records, "area"), [records]);
  const responsableOptions = useMemo(() => uniqueSorted(records, "responsable"), [records]);
  const categoriaOptions = useMemo(() => uniqueSorted(records, "categoria"), [records]);
  const proveedorOptions = useMemo(() => uniqueSorted(records, "proveedor"), [records]);

  const diasInfo = useMemo(() => {
    if (!form.fechaSolicitud) return null;
    return getDiasInfo({
      fechaSolicitud: form.fechaSolicitud,
      fechaEntrega: form.fechaEntrega,
      estado: form.estado,
    });
  }, [form.fechaSolicitud, form.fechaEntrega, form.estado]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.fechaSolicitud || !form.area || !form.responsable || !form.descripcion) {
      setError("Completa fecha de solicitud, área, responsable y descripción.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        valorConIva: form.valorConIva === "" ? null : Number(form.valorConIva),
        valorSinIva: form.valorSinIva === "" ? null : Number(form.valorSinIva),
        valorCot: form.valorCot === "" ? null : Number(form.valorCot),
      };
      let saved;
      if (isEdit) {
        saved = await updateRecordApi(record.id, payload);
      } else {
        saved = await createRecordApi(payload);
      }
      onSaved(saved, isEdit);
    } catch (err) {
      setError(err.message || "No se pudo guardar el registro.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteRecordApi(record.id);
      onDeleted(record.id);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el registro.");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>{isEdit ? "Editar registro" : "Agregar registro"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field">
              <label htmlFor="f-fechaSolicitud">Fecha de solicitud *</label>
              <input
                id="f-fechaSolicitud" type="date" required
                value={form.fechaSolicitud || ""}
                onChange={(e) => update("fechaSolicitud", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-fechaEntrega">Fecha de entrega</label>
              <input
                id="f-fechaEntrega" type="date"
                value={form.fechaEntrega || ""}
                onChange={(e) => update("fechaEntrega", e.target.value)}
              />
            </div>

            {diasInfo && (
              <div className="dias-preview">
                Días hábiles: <span className={`pill ${diasInfo.severity}`}>{diasInfo.label}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="f-area">Área *</label>
              <input
                id="f-area" list="areas-list" required
                value={form.area || ""}
                onChange={(e) => update("area", e.target.value)}
              />
              <datalist id="areas-list">
                {areaOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="f-responsable">Responsable *</label>
              <input
                id="f-responsable" list="responsables-list" required
                value={form.responsable || ""}
                onChange={(e) => update("responsable", e.target.value)}
              />
              <datalist id="responsables-list">
                {responsableOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="f-estado">Estado de compra</label>
              <select id="f-estado" value={form.estado || ""} onChange={(e) => update("estado", e.target.value)}>
                {ESTADOS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-categoria">Categoría</label>
              <input
                id="f-categoria" list="categorias-list"
                value={form.categoria || ""}
                onChange={(e) => update("categoria", e.target.value)}
              />
              <datalist id="categorias-list">
                {categoriaOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>

            <div className="field full">
              <label htmlFor="f-descripcion">Descripción *</label>
              <input
                id="f-descripcion" required
                value={form.descripcion || ""}
                onChange={(e) => update("descripcion", e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="f-medioPago">Medio de pago</label>
              <select id="f-medioPago" value={form.medioPago || ""} onChange={(e) => update("medioPago", e.target.value)}>
                <option value="">—</option>
                {MEDIOS_PAGO.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-proveedor">Proveedor</label>
              <input
                id="f-proveedor" list="proveedores-list"
                value={form.proveedor || ""}
                onChange={(e) => update("proveedor", e.target.value)}
              />
              <datalist id="proveedores-list">
                {proveedorOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="f-licitacion">Licitación</label>
              <input
                id="f-licitacion"
                value={form.licitacion || ""}
                onChange={(e) => update("licitacion", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-estadoLegalizacion">Estado legalización</label>
              <select
                id="f-estadoLegalizacion"
                value={form.estadoLegalizacion || ""}
                onChange={(e) => update("estadoLegalizacion", e.target.value)}
              >
                {ESTADOS_LEGALIZACION.map((v) => (
                  <option key={v} value={v}>{v === "" ? "—" : v}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-fe">FE / referencia</label>
              <input id="f-fe" value={form.fe || ""} onChange={(e) => update("fe", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-valorConIva">Valor + IVA</label>
              <input
                id="f-valorConIva" type="number" min="0"
                value={form.valorConIva ?? ""}
                onChange={(e) => update("valorConIva", e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="f-valorSinIva">Valor antes de IVA</label>
              <input
                id="f-valorSinIva" type="number" min="0"
                value={form.valorSinIva ?? ""}
                onChange={(e) => update("valorSinIva", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-valorCot">Valor cotizado</label>
              <input
                id="f-valorCot" type="number" min="0"
                value={form.valorCot ?? ""}
                onChange={(e) => update("valorCot", e.target.value)}
              />
            </div>

            <div className="field full">
              <label htmlFor="f-observaciones">Observaciones</label>
              <textarea
                id="f-observaciones" rows={3}
                value={form.observaciones || ""}
                onChange={(e) => update("observaciones", e.target.value)}
              />
            </div>

            {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
          </div>

          <div className="modal-foot">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <div className="spacer" />
            {isEdit && !confirmDelete && (
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => setConfirmDelete(true)}
              >
                🗑️ Eliminar
              </button>
            )}
            {isEdit && confirmDelete && (
              <div className="confirm-del">
                <span>¿Eliminar?</span>
                <button type="button" className="btn btn-danger-solid small" disabled={deleting} onClick={handleDelete}>
                  {deleting ? "Eliminando…" : "Sí"}
                </button>
                <button type="button" className="btn small" onClick={() => setConfirmDelete(false)}>No</button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
