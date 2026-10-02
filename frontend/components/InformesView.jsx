"use client";

import { useEffect, useRef, useState } from "react";
import ReportEditor from "@/components/ReportEditor";
import { updateReportApi, deleteReportApi, sendReportNowApi } from "@/lib/api";
import { IconMail, IconEdit, IconTrash, IconSend, IconClock, IconCheck, IconAlert } from "@/components/icons";

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function scheduleLabel(r) {
  if (r.frecuencia === "diaria") return `Diario · ${r.hora}`;
  if (r.frecuencia === "semanal") return `Cada ${DIAS_SEMANA[r.diaSemana] ?? "—"} · ${r.hora}`;
  return `Día ${r.diaMes} de cada mes · ${r.hora}`;
}

function weekendLabel(r) {
  if (r.sabadoHabil && r.domingoHabil) return "Sábado y domingo hábiles";
  if (r.sabadoHabil) return "Sábado hábil, domingo no";
  if (r.domingoHabil) return "Domingo hábil, sábado no";
  return "Sábado y domingo no hábiles";
}

function fmtDate(d) {
  if (!d) return "Nunca";
  return new Date(d).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function InformesView({ initialReports }) {
  const [reports, setReports] = useState(initialReports || []);
  const [tab, setTab] = useState("lista"); // "lista" | "crear"
  const [editingReport, setEditingReport] = useState(null); // null = informe nuevo
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function openCreate() {
    setEditingReport(null);
    setTab("crear");
  }

  function openEdit(report) {
    setEditingReport(report);
    setTab("crear");
  }

  function handleSaved(saved, isEdit) {
    setReports((prev) => (isEdit ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev]));
    setTab("lista");
    showToast(isEdit ? "Informe actualizado." : "Informe guardado — se enviará según su programación.");
  }

  async function handleToggleActivo(report) {
    setBusyId(report.id);
    try {
      const saved = await updateReportApi(report.id, { activo: !report.activo });
      setReports((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      showToast(saved.activo ? `"${saved.nombre}" activado.` : `"${saved.nombre}" desactivado.`);
    } catch (err) {
      setErrorMsg(err.message || "No se pudo actualizar el informe.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    setBusyId(id);
    try {
      await deleteReportApi(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      showToast("Informe eliminado.");
    } catch (err) {
      setErrorMsg(err.message || "No se pudo eliminar el informe.");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  async function handleSendNow(report) {
    setBusyId(report.id);
    setErrorMsg(null);
    try {
      const res = await sendReportNowApi(report.id);
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, ultimoEnvio: new Date().toISOString(), ultimoContenido: res.content, ultimoCuerpoCorreo: res.emailBody } : r)));
      showToast(`Correo enviado a ${report.destinatarios.length} destinatario(s)${report.cc?.length ? ` (CC: ${report.cc.length})` : ""}.`);
    } catch (err) {
      setErrorMsg(err.message || "No se pudo enviar el informe.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="dash-tabs" role="tablist" aria-label="Vista de informes" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "lista"} className="dash-tab" onClick={() => setTab("lista")}>
          Mis informes
        </button>
        <button
          type="button" role="tab" aria-selected={tab === "crear"} className="dash-tab"
          onClick={() => (tab === "crear" ? null : openCreate())}
        >
          {editingReport && tab === "crear" ? "Editar informe" : "Crear informe"}
        </button>
      </div>

      {errorMsg && (
        <div className="modal-error" style={{ marginBottom: 14 }}><IconAlert size={13} /> {errorMsg}</div>
      )}

      {tab === "crear" ? (
        <ReportEditor
          key={editingReport?.id || "nuevo"}
          report={editingReport}
          onCancel={() => setTab("lista")}
          onSaved={handleSaved}
        />
      ) : (
        <>
          <div className="view-head">
            <p className="card-sub" style={{ margin: 0, maxWidth: 680 }}>
              Describe por prompt qué debe contener cada informe (incluye gráficas automáticamente cuando el prompt pide comparar o distribuir datos), revisa cómo se vería el correo antes de guardar, y define a quién, en copia y cuándo se envía.
            </p>
          </div>

          {reports.length === 0 ? (
            <div className="table-card"><div className="empty">Aún no hay informes configurados. Crea el primero en la pestaña &quot;Crear informe&quot;.</div></div>
          ) : (
            <div className="report-grid">
              {reports.map((r) => {
                const busy = busyId === r.id;
                const confirming = confirmDeleteId === r.id;
                return (
                  <div key={r.id} className={`report-card${r.activo ? "" : " inactive"}`}>
                    <div className="report-card-top">
                      <span className="report-card-ic"><IconMail size={16} /></span>
                      <label className="report-switch" title={r.activo ? "Desactivar" : "Activar"}>
                        <input type="checkbox" checked={r.activo} disabled={busy} onChange={() => handleToggleActivo(r)} />
                        <span className="report-switch-track"><span className="report-switch-thumb" /></span>
                      </label>
                    </div>

                    <div className="report-card-name">{r.nombre}</div>
                    <div className="report-card-prompt">{r.prompt}</div>

                    <div className="report-card-meta">
                      <span><IconClock size={12} /> {scheduleLabel(r)}</span>
                      <span>{r.destinatarios.length} destinatario(s){r.cc?.length ? ` + ${r.cc.length} CC` : ""}</span>
                      <span>{weekendLabel(r)}</span>
                    </div>
                    <div className="report-card-last">Último envío: {fmtDate(r.ultimoEnvio)}</div>

                    {confirming ? (
                      <div className="confirm-del">
                        <span>¿Eliminar?</span>
                        <button type="button" className="btn btn-danger-solid small" disabled={busy} onClick={() => handleDelete(r.id)}>
                          {busy ? <span className="spinner" /> : "Sí"}
                        </button>
                        <button type="button" className="btn small" disabled={busy} onClick={() => setConfirmDeleteId(null)}>No</button>
                      </div>
                    ) : (
                      <div className="report-card-actions">
                        <button type="button" className="btn btn-sync" disabled={busy} onClick={() => handleSendNow(r)}>
                          {busy ? <span className="spinner" /> : <IconSend size={13} />} Enviar ahora
                        </button>
                        <button type="button" className="user-action-btn edit" title="Editar" onClick={() => openEdit(r)}>
                          <IconEdit size={14} />
                        </button>
                        <button type="button" className="user-action-btn delete" title="Eliminar" onClick={() => setConfirmDeleteId(r.id)}>
                          <IconTrash size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="toast toast-good" role="status">
          <IconCheck size={13} /> {toast}
        </div>
      )}
    </div>
  );
}
