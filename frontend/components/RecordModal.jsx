"use client";

import { useEffect, useMemo, useState } from "react";
import { getDiasInfo } from "@/lib/diasInfo";
import { fmtCOP } from "@/lib/format";
import { createRecordApi, updateRecordApi, deleteRecordApi, revisarCompraApi } from "@/lib/api";
import HallazgosRevision from "@/components/compras/agentes/HallazgosRevision";
import { IconSpark } from "@/components/icons";
import { IconTrash, IconClock, IconFile, IconLayers, IconMoney, IconEdit } from "@/components/icons";
import ObservacionesReview from "@/components/ObservacionesReview";
import MoneyInput from "@/components/MoneyInput";
import InvoiceScanner from "@/components/InvoiceScanner";
import ProveedorAutocomplete from "@/components/ProveedorAutocomplete";
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

const emptyForm = {
  fechaSolicitud: "",
  fechaEntrega: "",
  area: "",
  areaId: "",
  responsable: "",
  responsableUserId: "",
  estado: "Pendiente",
  estadoId: "",
  categoria: "",
  categoriaId: "",
  descripcion: "",
  medioPago: "",
  medioPagoId: "",
  nit: "",
  proveedor: "",
  proveedorNit: "",
  licitacion: "",
  estadoLegalizacion: "",
  estadoLegalizacionId: "",
  fe: "",
  valorConIva: "",
  valorSinIva: "",
  valorCot: "",
  moneda: "COP",
  valorUsd: "",
  trm: "",
  observaciones: "",
  actividadId: "",
};

export default function RecordModal({ record, records, onClose, onSaved, onDeleted, allowDelete = true, editableFields = null, maestros = [], proveedores = [], presupuestos = [], actividades = [], crear = null, actividadFija = null, prefill = null, puedeRevisar = false }) {
  const isEdit = !!record;
  // editableFields null = todos los campos editables (admin, registro).
  // Con lista (p.ej. legalizar), los demás campos quedan solo-lectura.
  const isEditable = (field) => !editableFields || editableFields.includes(field);
  const [form, setForm] = useState(() => {
    if (record) return { ...emptyForm, ...record };
    // Nuevo registro: preselecciona el id del maestro "Pendiente" (estado por
    // defecto histórico) si existe — si no, queda sin estado hasta que el
    // usuario elija uno.
    const pendienteId = maestros.find((m) => m.tipo === "estado" && m.valor === "Pendiente")?.id || "";
    return { ...emptyForm, estadoId: pendienteId, ...(prefill || {}) };
  });

  // Todo campo con maestro se guarda y referencia por id, nunca por texto
  // (ver CLAUDE.md) — el valor del <select> es el id del Maestro; el texto
  // (m.valor) solo se usa como label visible y como snapshot de respaldo en
  // el form. "activeIds" sale de `maestros`, que el server ya filtra a solo
  // activos — si el id guardado en el registro ya no está activo, se agrega
  // como opción sintética (con el texto que ya tenía el registro) para no
  // perder el dato ni forzar a elegir uno nuevo sin que el usuario lo decida.
  function maestroOptions(tipo, idField, textField) {
    const activeIds = new Set();
    const opts = [];
    for (const m of maestros) {
      if (m.tipo !== tipo) continue;
      activeIds.add(m.id);
      opts.push({ value: m.id, label: m.valor });
    }
    const currentId = form[idField];
    if (currentId && !activeIds.has(currentId)) {
      opts.push({ value: currentId, label: `${form[textField] || "(valor)"} (inactivo)` });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }

  function updateMaestroCampo(idField, textField, id) {
    const match = maestros.find((m) => m.id === id);
    setForm((f) => ({ ...f, [idField]: id, [textField]: match ? match.valor : "" }));
  }

  // El responsable es un caso particular: se referencia por userId (no por
  // el id del Maestro), porque la fila de Maestro(tipo="responsable") está
  // atada a un usuario (ver backend/lib/maestros.js).
  function responsableOptions() {
    const activeIds = new Set();
    const opts = [];
    for (const m of maestros) {
      if (m.tipo !== "responsable" || !m.userId) continue;
      activeIds.add(m.userId);
      opts.push({ value: m.userId, label: m.valor });
    }
    const current = form.responsableUserId;
    if (current && !activeIds.has(current)) {
      opts.push({ value: current, label: `${form.responsable || "(usuario)"} (inactivo)` });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [pendingInvoiceFields, setPendingInvoiceFields] = useState([]);
  // Agente revisor: revisa el borrador contra el procedimiento (umbral, compra partida, proveedor, duplicados, precio,
  // categoría). Solo avisa: nunca bloquea guardar.
  const [revision, setRevision] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const [errorRevision, setErrorRevision] = useState("");
  async function revisarConNova() {
    setErrorRevision("");
    setRevisando(true);
    try {
      setRevision(await revisarCompraApi({ ...form, valorConIva: form.valorConIva === "" ? null : Number(form.valorConIva) }, record?.id || null));
      // El formulario es largo: lleva la vista al resultado para que no pase desapercibido.
      setTimeout(() => document.querySelector(".ag-revision-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
    } catch (e) {
      setErrorRevision(e.message);
    } finally {
      setRevisando(false);
    }
  }

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

  // Actividades de Bienestar agrupadas por mes. Las cerradas no reciben compras nuevas, salvo la que ya tiene esta compra.
  const actividadOptions = useMemo(() => {
    const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const grupos = new Map();
    for (const a of actividades) {
      if (a.estado === "cerrada" && a.id !== record?.actividadId) continue;
      const label = a.fecha ? `${MESES[Number(a.fecha.slice(5, 7)) - 1]} ${a.fecha.slice(0, 4)}` : "Sin fecha";
      if (!grupos.has(label)) grupos.set(label, []);
      grupos.get(label).push({ id: a.id, label: `${a.fecha ? `${Number(a.fecha.slice(8, 10))} · ` : ""}${a.nombre} (${a.linea})` });
    }
    return [...grupos].map(([label, items]) => ({ label, items }));
  }, [actividades, record?.actividadId]);
  const actividadElegida = actividades.find((a) => a.id === Number(form.actividadId)) || null;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.fechaSolicitud || !form.areaId || !form.responsableUserId || !form.descripcion) {
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
        // crear: quien abre el formulario decide cómo se crea (p. ej. desde una solicitud de compra).
        saved = await (crear || createRecordApi)(payload);
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
              <select
                id="f-estado"
                value={form.estadoId || ""}
                onChange={(e) => updateMaestroCampo("estadoId", "estado", e.target.value)}
                disabled={!isEditable("estado")}
              >
                <option value="">—</option>
                {maestroOptions("estado", "estadoId", "estado").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-medioPago">Medio de pago</label>
              <select
                id="f-medioPago"
                value={form.medioPagoId || ""}
                onChange={(e) => updateMaestroCampo("medioPagoId", "medioPago", e.target.value)}
                disabled={!isEditable("medioPago")}
              >
                <option value="">—</option>
                {maestroOptions("medioPago", "medioPagoId", "medioPago").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                value={form.areaId || ""}
                onChange={(e) => updateMaestroCampo("areaId", "area", e.target.value)}
                disabled={!isEditable("area")}
              >
                <option value="">Selecciona un área…</option>
                {maestroOptions("area", "areaId", "area").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-responsable">Responsable *</label>
              <select
                id="f-responsable" required
                value={form.responsableUserId || ""}
                onChange={(e) => {
                  const userId = e.target.value;
                  const match = maestros.find((m) => m.tipo === "responsable" && m.userId === userId);
                  setForm((f) => ({ ...f, responsableUserId: userId, responsable: match ? match.valor : "" }));
                }}
                disabled={!isEditable("responsable")}
              >
                <option value="">Selecciona un responsable…</option>
                {responsableOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-categoria">Categoría</label>
              <select
                id="f-categoria"
                value={form.categoriaId || ""}
                onChange={(e) => updateMaestroCampo("categoriaId", "categoria", e.target.value)}
                disabled={!isEditable("categoria")}
              >
                <option value="">—</option>
                {maestroOptions("categoria", "categoriaId", "categoria").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="f-proveedor">Proveedor <span className="muted">(opcional)</span></label>
              <ProveedorAutocomplete
                id="f-proveedor"
                nombre={form.proveedor || ""}
                nit={form.nit || ""}
                proveedorNit={form.proveedorNit || ""}
                proveedores={proveedores}
                disabled={!isEditable("proveedor")}
                onChange={({ nombre, nit, proveedorNit }) => setForm((f) => ({ ...f, proveedor: nombre, nit, proveedorNit }))}
              />
            </div>
            <div className="field full">
              <label htmlFor="f-actividad">Actividad de Bienestar <span className="muted">(opcional)</span></label>
              {actividadFija ? (
                <div className="dvalue actividad-fija" id="f-actividad">{actividadFija}</div>
              ) : (
              <select
                id="f-actividad"
                value={form.actividadId || ""}
                onChange={(e) => update("actividadId", e.target.value ? Number(e.target.value) : "")}
                disabled={!isEditable("actividadId")}
              >
                <option value="">Ninguna — la compra no es de una actividad</option>
                {actividadOptions.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </optgroup>
                ))}
              </select>
              )}
              {actividadElegida?.presupuesto ? (
                <span className="card-sub" style={{ margin: 0 }}>
                  Presupuesto de la actividad: {fmtCOP(actividadElegida.gastado)} de {fmtCOP(actividadElegida.presupuesto)} ya comprometidos en {actividadElegida.compras} compra(s).
                </span>
              ) : null}
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
                value={form.estadoLegalizacionId || ""}
                onChange={(e) => updateMaestroCampo("estadoLegalizacionId", "estadoLegalizacion", e.target.value)}
                disabled={!isEditable("estadoLegalizacion")}
              >
                <option value="">—</option>
                {maestroOptions("estadoLegalizacion", "estadoLegalizacionId", "estadoLegalizacion").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

            {(revision || errorRevision) && (
              <div className="full ag-revision-form" style={{ gridColumn: "1 / -1" }}>
                {errorRevision ? <div className="modal-error">{errorRevision}</div> : (
                  <HallazgosRevision revision={revision} compacto onCategoria={isEditable("categoria") ? (c) => { updateMaestroCampo("categoriaId", "categoria", c.id); setRevision(null); } : undefined} />
                )}
              </div>
            )}
            {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
          </div>

          <div className="modal-foot">
            <button type="submit" className="btn btn-primary" disabled={saving || deleting || aiReviewLoading} title={aiReviewLoading ? "Espera a que termine la revisión con Nova" : undefined}>
              {saving && <span className="spinner" />}
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="btn" onClick={onClose} disabled={saving || deleting}>Cancelar</button>
            {puedeRevisar && <button type="button" className="btn agente-boton" onClick={revisarConNova} disabled={revisando || saving || !form.descripcion} title="Revisa la compra contra el procedimiento antes de guardar. No cambia nada.">
              {revisando ? <><span className="spinner" /> Revisando…</> : <><IconSpark size={13} /> {revision ? "Revisar la compra de nuevo" : "Revisar la compra"}</>}
            </button>}
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
