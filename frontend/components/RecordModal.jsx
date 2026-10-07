"use client";

import { useEffect, useMemo, useState } from "react";
import { getDiasInfo } from "@/lib/diasInfo";
import { fmtCOP } from "@/lib/format";
import { createRecordApi, updateRecordApi, deleteRecordApi } from "@/lib/api";
import { IconTrash, IconClock, IconFile, IconLayers, IconMoney, IconEdit } from "@/components/icons";
import ObservacionesReview from "@/components/ObservacionesReview";
import MoneyInput from "@/components/MoneyInput";
import InvoiceScanner from "@/components/InvoiceScanner";
import { FIELD_LABELS } from "@/lib/auditLabels";

const PRESUPUESTO_ALERTA_PCT = 80;
const PRESUPUESTO_CRITICO_PCT = 90;

const INVOICE_MONEY_FIELDS = new Set(["valorConIva", "valorSinIva", "valorCot", "valorUsd", "trm"]);

function formatInvoiceFieldValue(field, value) {
  if (value === "" || value === null || value === undefined) return "—";
  if (INVOICE_MONEY_FIELDS.has(field)) return fmtCOP(Number(value));
  if (field === "moneda") return value === "USD" ? "Dólares (USD)" : "Pesos colombianos (COP)";
  return String(value);
}

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
  moneda: "COP",
  valorUsd: "",
  trm: "",
  observaciones: "",
};

export default function RecordModal({ record, records, onClose, onSaved, onDeleted, allowDelete = true, editableFields = null, maestros = [], presupuestos = [] }) {
  const isEdit = !!record;
  // editableFields null = todos los campos editables (admin, registro).
  // Con lista (p.ej. legalizar), los demás campos quedan solo-lectura.
  const isEditable = (field) => !editableFields || editableFields.includes(field);
  const [form, setForm] = useState(() => (record ? { ...emptyForm, ...record } : emptyForm));

  // Opciones del maestro para `tipo`, más el valor actual del registro si
  // quedó inactivo/no está en el maestro (para no perderlo/cambiarlo sin que
  // el usuario lo decida explícitamente al editar un registro viejo).
  function optionsFor(tipo) {
    const activeValues = new Set();
    const opts = [];
    for (const m of maestros) {
      if (m.tipo !== tipo) continue;
      activeValues.add(m.valor);
      opts.push({ value: m.valor, label: m.valor });
    }
    const current = form[tipo];
    if (current && !activeValues.has(current)) {
      opts.push({ value: current, label: `${current} (inactivo)` });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [pendingInvoiceFields, setPendingInvoiceFields] = useState([]);

  // Al leer una factura: los campos vacíos se llenan directo; si el campo ya
  // tiene un valor distinto al que trae la factura, no se sobrescribe solo —
  // se deja pendiente para que el usuario decida cuál de los dos valores usar.
  function handleInvoiceExtract(fields) {
    const patch = {};
    const conflicts = [];
    for (const [key, value] of Object.entries(fields)) {
      const currentVal = form[key];
      const isEmpty = currentVal === "" || currentVal === null || currentVal === undefined;
      if (isEmpty) {
        patch[key] = value;
      } else if (String(currentVal) !== String(value)) {
        conflicts.push({ field: key, label: FIELD_LABELS[key] || key, current: currentVal, next: value });
      }
    }
    if (Object.keys(patch).length > 0) setForm((f) => ({ ...f, ...patch }));
    if (conflicts.length > 0) {
      setPendingInvoiceFields((prev) => [...prev.filter((c) => !conflicts.some((n) => n.field === c.field)), ...conflicts]);
    }
  }

  function acceptInvoiceField(field) {
    const item = pendingInvoiceFields.find((c) => c.field === field);
    if (item) setForm((f) => ({ ...f, [field]: item.next }));
    setPendingInvoiceFields((prev) => prev.filter((c) => c.field !== field));
  }

  function dismissInvoiceField(field) {
    setPendingInvoiceFields((prev) => prev.filter((c) => c.field !== field));
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const proveedorOptions = useMemo(() => uniqueSorted(records, "proveedor"), [records]);

  // Aviso informativo (nunca bloquea guardar): cuántas otras compras ya tienen
  // el mismo FE — un mismo número de factura puede cubrir varias compras.
  const feDuplicados = useMemo(() => {
    const fe = (form.fe || "").trim();
    if (!fe) return 0;
    return records.filter((r) => r.id !== record?.id && (r.fe || "").trim() === fe).length;
  }, [form.fe, records, record?.id]);

  // Panel informativo: gastado vs. presupuesto del año actual (configurado en
  // la sección "Presupuesto"), no bloquea el guardado, solo orienta al elegir
  // área/categoría. Si el área maneja presupuesto por categoría y ya hay una
  // categoría elegida con presupuesto propio, se compara contra esa categoría;
  // si no, contra el total del área.
  const presupuestoInfo = useMemo(() => {
    const area = form.area;
    if (!area) return null;
    const year = new Date().getFullYear();
    const p = presupuestos.find((x) => x.area === area && x.anio === year);
    if (!p) return null;

    let label = area;
    let presupuestoAnual = p.total;
    const catBudget = p.modo === "categoria" && form.categoria
      ? p.categorias.find((c) => c.categoria === form.categoria)
      : null;
    if (catBudget) {
      label = `${area} — ${form.categoria}`;
      presupuestoAnual = catBudget.valor;
    }
    if (!presupuestoAnual) return null;

    const mk = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    let gastadoAnual = 0;
    let gastadoMes = 0;
    for (const r of records) {
      if (r.area !== area || r.estado === "Anulado") continue;
      if (catBudget && r.categoria !== form.categoria) continue;
      if (!r.fechaSolicitud || !r.fechaSolicitud.startsWith(String(year))) continue;
      gastadoAnual += r.valorConIva || 0;
      if (r.fechaSolicitud.slice(0, 7) === mk) gastadoMes += r.valorConIva || 0;
    }

    const presupuestoMensual = presupuestoAnual / 12;
    const pctAnual = presupuestoAnual ? (gastadoAnual / presupuestoAnual) * 100 : 0;
    const pctMensual = presupuestoMensual ? (gastadoMes / presupuestoMensual) * 100 : 0;

    return {
      label, presupuestoAnual, presupuestoMensual,
      gastadoAnual, gastadoMes,
      disponibleAnual: presupuestoAnual - gastadoAnual,
      disponibleMensual: presupuestoMensual - gastadoMes,
      pctAnual, pctMensual,
    };
  }, [form.area, form.categoria, presupuestos, records]);

  function presupuestoSeverity(pct) {
    if (pct >= PRESUPUESTO_CRITICO_PCT) return "critical";
    if (pct >= PRESUPUESTO_ALERTA_PCT) return "warning";
    return "good";
  }

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
        valorUsd: form.moneda === "USD" && form.valorUsd !== "" ? Number(form.valorUsd) : null,
        trm: form.moneda === "USD" && form.trm !== "" ? Number(form.trm) : null,
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
      <div className="modal record-modal">
        <div className="modal-head">
          <h3>{isEdit ? "Editar registro" : "Agregar registro"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            <div className="field full">
              <InvoiceScanner disabled={saving} onExtract={handleInvoiceExtract} />
            </div>

            {pendingInvoiceFields.length > 0 && (
              <div className="field full">
                <div className="invoice-conflicts">
                  <p className="invoice-conflicts-title">
                    La factura trae valores distintos a los que ya tienes en el formulario — decide cuáles aplicar:
                  </p>
                  {pendingInvoiceFields.map((c) => (
                    <div className="invoice-conflict-row" key={c.field}>
                      <div>
                        <span className="invoice-conflict-label">{c.label}</span>
                        <span className="invoice-conflict-values">
                          Actual: <strong>{formatInvoiceFieldValue(c.field, c.current)}</strong>
                          {" → "}
                          Factura: <strong>{formatInvoiceFieldValue(c.field, c.next)}</strong>
                        </span>
                      </div>
                      <div className="invoice-conflict-actions">
                        <button type="button" className="btn small" onClick={() => dismissInvoiceField(c.field)}>
                          Mantener actual
                        </button>
                        <button type="button" className="btn btn-primary small" onClick={() => acceptInvoiceField(c.field)}>
                          Usar el de la factura
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== Fechas y estado ===== */}
            <div className="record-section-head">
              <span className="record-section-ic"><IconClock size={14} /></span>
              <div>
                <p className="record-section-title">Fechas y estado</p>
                <p className="record-section-sub">¿Cuándo se pidió y en qué va?</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="f-fechaSolicitud">Fecha de solicitud *</label>
              <input
                id="f-fechaSolicitud" type="date" required
                value={form.fechaSolicitud || ""}
                onChange={(e) => update("fechaSolicitud", e.target.value)}
                disabled={!isEditable("fechaSolicitud")}
              />
            </div>
            <div className="field">
              <label htmlFor="f-fechaEntrega">Fecha de entrega</label>
              <input
                id="f-fechaEntrega" type="date"
                value={form.fechaEntrega || ""}
                onChange={(e) => update("fechaEntrega", e.target.value)}
                disabled={!isEditable("fechaEntrega")}
              />
            </div>

            {diasInfo && (
              <div className="dias-preview">
                Días hábiles transcurridos: <span className={`pill ${diasInfo.severity}`}>{diasInfo.label}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="f-estado">Estado de la compra</label>
              <select id="f-estado" value={form.estado || ""} onChange={(e) => update("estado", e.target.value)} disabled={!isEditable("estado")}>
                {optionsFor("estado").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-medioPago">Medio de pago</label>
              <select id="f-medioPago" value={form.medioPago || ""} onChange={(e) => update("medioPago", e.target.value)} disabled={!isEditable("medioPago")}>
                <option value="">—</option>
                {optionsFor("medioPago").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* ===== Qué y quién ===== */}
            <div className="record-section-head">
              <span className="record-section-ic"><IconFile size={14} /></span>
              <div>
                <p className="record-section-title">¿Qué se compró y quién lo pidió?</p>
                <p className="record-section-sub">Lo esencial para identificar esta compra.</p>
              </div>
            </div>

            <div className="field full">
              <label htmlFor="f-descripcion">Descripción *</label>
              <input
                id="f-descripcion" required
                value={form.descripcion || ""}
                onChange={(e) => update("descripcion", e.target.value)}
                disabled={!isEditable("descripcion")}
                placeholder="Ej. Compra de resma de papel para oficina"
                spellCheck lang="es"
              />
            </div>

            <div className="field">
              <label htmlFor="f-area">Área *</label>
              <select
                id="f-area" required
                value={form.area || ""}
                onChange={(e) => update("area", e.target.value)}
                disabled={!isEditable("area")}
              >
                <option value="">Selecciona un área…</option>
                {optionsFor("area").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-responsable">Responsable *</label>
              <select
                id="f-responsable" required
                value={form.responsable || ""}
                onChange={(e) => update("responsable", e.target.value)}
                disabled={!isEditable("responsable")}
              >
                <option value="">Selecciona un responsable…</option>
                {optionsFor("responsable").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-categoria">Categoría</label>
              <input
                id="f-categoria" list="categorias-list"
                value={form.categoria || ""}
                onChange={(e) => update("categoria", e.target.value)}
                disabled={!isEditable("categoria")}
                placeholder="Escribe para buscar…"
                spellCheck lang="es"
              />
              <datalist id="categorias-list">
                {optionsFor("categoria").map((o) => <option key={o.value} value={o.value} />)}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="f-proveedor">Proveedor</label>
              <input
                id="f-proveedor" list="proveedores-list"
                value={form.proveedor || ""}
                onChange={(e) => update("proveedor", e.target.value)}
                disabled={!isEditable("proveedor")}
                placeholder="Escribe para buscar…"
                spellCheck lang="es"
              />
              <datalist id="proveedores-list">
                {proveedorOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>

            {presupuestoInfo && (
              <div className="dias-preview">
                Presupuesto {presupuestoInfo.label} — mes:{" "}
                <span className={`pill ${presupuestoSeverity(presupuestoInfo.pctMensual)}`}>
                  {fmtCOP(presupuestoInfo.gastadoMes)} de {fmtCOP(presupuestoInfo.presupuestoMensual)} ({presupuestoInfo.pctMensual.toFixed(0)}%)
                </span>{" "}
                · disponible {fmtCOP(presupuestoInfo.disponibleMensual)}
                <br />
                Año: <span className={`pill ${presupuestoSeverity(presupuestoInfo.pctAnual)}`}>
                  {fmtCOP(presupuestoInfo.gastadoAnual)} de {fmtCOP(presupuestoInfo.presupuestoAnual)} ({presupuestoInfo.pctAnual.toFixed(0)}%)
                </span>{" "}
                · disponible {fmtCOP(presupuestoInfo.disponibleAnual)}
              </div>
            )}

            {/* ===== Valor de la compra ===== */}
            <div className="record-section-head">
              <span className="record-section-ic"><IconMoney size={14} /></span>
              <div>
                <p className="record-section-title">Valor de la compra</p>
                <p className="record-section-sub">Siempre en pesos colombianos — la moneda solo aplica a los campos de referencia de abajo.</p>
              </div>
            </div>

            <div className="field full">
              <label>Moneda original de la compra</label>
              <div className="pill-group">
                <button
                  type="button" className={`pill-btn${form.moneda !== "USD" ? " active" : ""}`}
                  onClick={() => update("moneda", "COP")}
                  disabled={!isEditable("moneda")}
                >
                  Pesos colombianos
                </button>
                <button
                  type="button" className={`pill-btn${form.moneda === "USD" ? " active" : ""}`}
                  onClick={() => update("moneda", "USD")}
                  disabled={!isEditable("moneda")}
                >
                  Dólares
                </button>
              </div>
            </div>

            {form.moneda === "USD" && (
              <>
                <div className="field">
                  <label htmlFor="f-valorUsd">Valor total en USD (referencia)</label>
                  <MoneyInput
                    id="f-valorUsd" prefix="US$"
                    value={form.valorUsd} onChange={(v) => update("valorUsd", v)}
                    disabled={!isEditable("valorUsd")}
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-trm">TRM utilizada (referencia)</label>
                  <MoneyInput
                    id="f-trm"
                    value={form.trm} onChange={(v) => update("trm", v)}
                    disabled={!isEditable("trm")}
                  />
                </div>
                {form.valorUsd !== "" && form.trm !== "" && Number.isFinite(parseFloat(form.valorUsd)) && Number.isFinite(parseFloat(form.trm)) && (
                  <div className="field full">
                    <p className="schedule-note" style={{ margin: 0 }}>
                      US${parseFloat(form.valorUsd).toLocaleString("es-CO")} × TRM {parseFloat(form.trm).toLocaleString("es-CO")} ≈ {fmtCOP(parseFloat(form.valorUsd) * parseFloat(form.trm))} — solo de referencia, no se guarda ni llena ningún campo automáticamente; ingresa tú mismo el "Valor + IVA" en pesos.
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="field">
              <label htmlFor="f-valorConIva">Valor + IVA</label>
              <MoneyInput
                id="f-valorConIva"
                value={form.valorConIva} onChange={(v) => update("valorConIva", v)}
                disabled={!isEditable("valorConIva")}
              />
            </div>

            <div className="field">
              <label htmlFor="f-valorSinIva">Valor antes de IVA</label>
              <MoneyInput
                id="f-valorSinIva"
                value={form.valorSinIva} onChange={(v) => update("valorSinIva", v)}
                disabled={!isEditable("valorSinIva")}
              />
            </div>
            <div className="field">
              <label htmlFor="f-valorCot">Valor cotizado</label>
              <MoneyInput
                id="f-valorCot"
                value={form.valorCot} onChange={(v) => update("valorCot", v)}
                disabled={!isEditable("valorCot")}
              />
            </div>

            {/* ===== Legalización y trámite ===== */}
            <div className="record-section-head">
              <span className="record-section-ic"><IconLayers size={14} /></span>
              <div>
                <p className="record-section-title">Legalización y trámite</p>
                <p className="record-section-sub">Documentos y referencias del proceso.</p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="f-estadoLegalizacion">Estado legalización</label>
              <select
                id="f-estadoLegalizacion"
                value={form.estadoLegalizacion || ""}
                onChange={(e) => update("estadoLegalizacion", e.target.value)}
                disabled={!isEditable("estadoLegalizacion")}
              >
                <option value="">—</option>
                {optionsFor("estadoLegalizacion").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-fe">FE / referencia</label>
              <input id="f-fe" value={form.fe || ""} onChange={(e) => update("fe", e.target.value)} disabled={!isEditable("fe")} />
              {feDuplicados > 0 && (
                <span className="pill warning" style={{ marginTop: 4, alignSelf: "flex-start" }}>
                  Ya existe{feDuplicados > 1 ? `n ${feDuplicados} compras` : " 1 compra"} con este FE
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="f-licitacion">Licitación</label>
              <input
                id="f-licitacion"
                value={form.licitacion || ""}
                onChange={(e) => update("licitacion", e.target.value)}
                disabled={!isEditable("licitacion")}
              />
            </div>

            {/* ===== Observaciones ===== */}
            <div className="record-section-head">
              <span className="record-section-ic"><IconEdit size={14} /></span>
              <div>
                <p className="record-section-title">Observaciones</p>
                <p className="record-section-sub">Cualquier detalle o justificación adicional.</p>
              </div>
            </div>

            <div className="field full">
              <label htmlFor="f-observaciones">Observaciones</label>
              <textarea
                id="f-observaciones" rows={3}
                value={form.observaciones || ""}
                onChange={(e) => update("observaciones", e.target.value)}
                disabled={!isEditable("observaciones")}
                spellCheck lang="es"
              />
              {isEditable("observaciones") && (
                <ObservacionesReview
                  observaciones={form.observaciones}
                  estadoLegalizacion={form.estadoLegalizacion}
                  descripcion={form.descripcion}
                  area={form.area}
                  categoria={form.categoria}
                  proveedor={form.proveedor}
                  valorConIva={form.valorConIva}
                  onLoadingChange={setAiReviewLoading}
                />
              )}
            </div>

            {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
          </div>

          <div className="modal-foot">
            <button type="submit" className="btn btn-primary" disabled={saving || deleting || aiReviewLoading} title={aiReviewLoading ? "Espera a que termine la revisión con Nova" : undefined}>
              {saving && <span className="spinner" />}
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="btn" onClick={onClose} disabled={saving || deleting}>Cancelar</button>
            <div className="spacer" />
            {isEdit && allowDelete && !confirmDelete && (
              <button
                type="button"
                className="btn btn-danger-outline"
                onClick={() => setConfirmDelete(true)}
              >
                <IconTrash size={13} /> Eliminar
              </button>
            )}
            {isEdit && allowDelete && confirmDelete && (
              <div className="confirm-del">
                <span>¿Eliminar?</span>
                <button type="button" className="btn btn-danger-solid small" disabled={deleting} onClick={handleDelete}>
                  {deleting && <span className="spinner" />}
                  {deleting ? "Eliminando…" : "Sí"}
                </button>
                <button type="button" className="btn small" onClick={() => setConfirmDelete(false)} disabled={deleting}>No</button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
