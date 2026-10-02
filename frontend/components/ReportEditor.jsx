"use client";

import { useEffect, useState } from "react";
import { previewReportApi, createReportApi, updateReportApi, renderReportPdfApi } from "@/lib/api";
import { IconSpark, IconAlert, IconCheck } from "@/components/icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FRECUENCIAS = [
  { key: "diaria", label: "Diaria" },
  { key: "semanal", label: "Semanal" },
  { key: "mensual", label: "Mensual" },
];

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_SEMANA_VALUE = [1, 2, 3, 4, 5, 6, 0]; // getDay(): 0 = domingo

const CUERPO_MODOS = [
  { key: "plano", label: "Texto plano" },
  { key: "resumen", label: "Texto plano + resumen" },
];

function emptyForm(report) {
  return {
    nombre: report?.nombre || "",
    prompt: report?.prompt || "",
    frecuencia: report?.frecuencia || "diaria",
    diaSemana: report?.diaSemana ?? 1,
    diaMes: report?.diaMes ?? 1,
    hora: report?.hora || "07:00",
    sabadoHabil: report?.sabadoHabil ?? false,
    domingoHabil: report?.domingoHabil ?? false,
    destinatarios: report?.destinatarios || [],
    cc: report?.cc || [],
    cuerpoModo: report?.cuerpoModo || "resumen",
    cuerpoPrompt: report?.cuerpoPrompt || "",
  };
}

function EmailField({ label, placeholder, value, onChange, required }) {
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState("");

  function add() {
    const email = input.trim().replace(/,$/, "");
    if (!email) return;
    if (!EMAIL_RE.test(email)) { setLocalError(`"${email}" no es un correo válido.`); return; }
    if (value.includes(email)) { setInput(""); return; }
    setLocalError("");
    onChange([...value, email]);
    setInput("");
  }

  function remove(email) {
    onChange(value.filter((e) => e !== email));
  }

  return (
    <div className="field full">
      <label>{label}{required ? " *" : ""}</label>
      <div className="recipient-box">
        {value.map((email) => (
          <span key={email} className="recipient-chip">
            {email}
            <button type="button" onClick={() => remove(email)} aria-label={`Quitar ${email}`}>✕</button>
          </span>
        ))}
        <input
          type="email" value={input} placeholder={placeholder}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); add(); } }}
          onBlur={add}
        />
      </div>
      {localError && <div className="modal-error" style={{ marginTop: 4 }}>{localError}</div>}
    </div>
  );
}

export default function ReportEditor({ report, onCancel, onSaved }) {
  const isEdit = !!report;
  const [form, setForm] = useState(emptyForm(report));
  const [preview, setPreview] = useState(report?.ultimoContenido ? { content: report.ultimoContenido, pdfBase64: null, emailBody: report.ultimoCuerpoCorreo || null } : null);
  const [previewTab, setPreviewTab] = useState("cuerpo"); // "cuerpo" | "pdf"
  const [previewing, setPreviewing] = useState(false);
  const [restoringPdf, setRestoringPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Al editar un informe ya guardado, el PDF en sí no se persiste en la BD
  // (solo el contenido estructurado) — se vuelve a dibujar al instante desde
  // ese contenido, sin volver a llamar a la IA, para mostrar de nuevo
  // exactamente lo que se había generado la última vez.
  useEffect(() => {
    if (!report?.ultimoContenido) return;
    let cancelled = false;
    setRestoringPdf(true);
    renderReportPdfApi({ content: report.ultimoContenido, nombre: report.nombre })
      .then((res) => { if (!cancelled) setPreview((p) => ({ ...p, pdfBase64: res.pdfBase64 })); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRestoringPdf(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handlePreview() {
    if (!form.prompt.trim()) { setError("Describe qué debe contener el informe antes de generar la vista previa."); return; }
    setError("");
    setPreviewing(true);
    try {
      const res = await previewReportApi({
        prompt: form.prompt, nombre: form.nombre,
        cuerpoModo: form.cuerpoModo, cuerpoPrompt: form.cuerpoPrompt,
      });
      setPreview(res);
      setPreviewTab("cuerpo");
    } catch (err) {
      setError(err.message || "No se pudo generar la vista previa.");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSave() {
    setError("");
    if (!form.nombre.trim()) return setError("Dale un nombre al informe.");
    if (!form.cuerpoPrompt.trim()) return setError("Describe las instrucciones de estilo para el cuerpo del correo.");
    if (!form.prompt.trim()) return setError("Describe qué debe contener el informe.");
    if (!form.destinatarios.length) return setError("Agrega al menos un destinatario en \"Para\".");
    if (!preview?.content) return setError("Genera la vista previa antes de guardar, para confirmar cómo se verá el correo.");

    setSaving(true);
    try {
      const payload = { ...form, contenido: preview.content, ultimoCuerpoCorreo: preview.emailBody || null };
      const saved = isEdit ? await updateReportApi(report.id, payload) : await createReportApi(payload);
      onSaved(saved, isEdit);
    } catch (err) {
      setError(err.message || "No se pudo guardar el informe.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="report-editor-grid">
      <div className="report-editor-form">
        <div className="field full">
          <label htmlFor="rp-nombre">Nombre del informe *</label>
          <input id="rp-nombre" value={form.nombre} onChange={(e) => update("nombre", e.target.value)} placeholder="Ej. Resumen semanal de compras" />
        </div>

        <div className="field full">
          <label>Cuerpo del correo (el informe completo va como PDF adjunto)</label>
          <div className="pill-group">
            {CUERPO_MODOS.map((m) => (
              <button
                key={m.key} type="button"
                className={`pill-btn${form.cuerpoModo === m.key ? " active" : ""}`}
                onClick={() => update("cuerpoModo", m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field full">
          <label htmlFor="rp-cuerpo-prompt">Instrucciones de estilo para el cuerpo *</label>
          <textarea
            id="rp-cuerpo-prompt" rows={2} value={form.cuerpoPrompt} onChange={(e) => update("cuerpoPrompt", e.target.value)}
            placeholder="Ej. Sé formal y dirígete a los jefes de área."
          />
          <p className="schedule-note">
            El cuerpo del correo siempre es texto plano (nunca tablas ni gráficas, para que no se vea descuadrado en el correo): aunque pidas aquí una tabla o gráfica, solo generará un análisis o resumen en texto de lo que ya trae el informe en PDF adjunto.
          </p>
        </div>

        <div className="field full">
          <label htmlFor="rp-prompt">¿Qué debe contener? (prompt) *</label>
          <textarea
            id="rp-prompt" rows={4} value={form.prompt} onChange={(e) => update("prompt", e.target.value)}
            placeholder="Ej. Resume el total comprado por área, destaca las compras sin legalizar, muestra el cumplimiento de tiempos de entrega y grafica la distribución por categoría."
          />
        </div>

        <div className="field full">
          <button type="button" className="btn btn-sync" onClick={handlePreview} disabled={previewing}>
            {previewing ? <span className="spinner" /> : <IconSpark size={14} />}
            {previewing ? "Generando vista previa…" : "Generar vista previa"}
          </button>
          {previewing && <p className="schedule-note" style={{ marginTop: 6 }}>Puede tardar hasta 1-2 minutos con informes grandes.</p>}
        </div>

        <div className="field-row">
          <div className="field">
            <label>Frecuencia de envío</label>
            <div className="pill-group">
              {FRECUENCIAS.map((f) => (
                <button
                  key={f.key} type="button"
                  className={`pill-btn${form.frecuencia === f.key ? " active" : ""}`}
                  onClick={() => update("frecuencia", f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Fin de semana hábil</label>
            <div className="pill-group">
              <button type="button" className={`pill-btn${form.sabadoHabil ? " active" : ""}`} onClick={() => update("sabadoHabil", !form.sabadoHabil)}>Sábado</button>
              <button type="button" className={`pill-btn${form.domingoHabil ? " active" : ""}`} onClick={() => update("domingoHabil", !form.domingoHabil)}>Domingo</button>
            </div>
          </div>
        </div>
        <p className="schedule-note">
          Por defecto ninguno es hábil (no se envía sábado ni domingo). Si el envío cae en un día no seleccionado aquí, se enviará el siguiente día hábil.
        </p>

        {form.frecuencia === "diaria" && (
          <p className="schedule-note">Se enviará todos los días a la hora indicada.</p>
        )}

        {form.frecuencia === "semanal" && (
          <div className="field full">
            <label>Día de la semana</label>
            <div className="pill-group">
              {DIAS_SEMANA.map((d, i) => (
                <button
                  key={d} type="button"
                  className={`pill-btn${form.diaSemana === DIAS_SEMANA_VALUE[i] ? " active" : ""}`}
                  onClick={() => update("diaSemana", DIAS_SEMANA_VALUE[i])}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {form.frecuencia === "mensual" && (
          <div className="field full">
            <label htmlFor="rp-dia-mes">Día del mes</label>
            <select id="rp-dia-mes" value={form.diaMes} onChange={(e) => update("diaMes", Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <p className="schedule-note">
              Si eliges el día 31: en meses de 30 días se envía el día 30, y en febrero se envía el último día del mes.
            </p>
          </div>
        )}

        <div className="field">
          <label htmlFor="rp-hora">Hora de envío</label>
          <input id="rp-hora" type="time" value={form.hora} onChange={(e) => update("hora", e.target.value)} />
        </div>

        <EmailField
          label="Para" required placeholder="correo@sinco.com.co y Enter"
          value={form.destinatarios} onChange={(v) => update("destinatarios", v)}
        />
        <EmailField
          label="Con copia (CC)" placeholder="Opcional — correo@sinco.com.co y Enter"
          value={form.cc} onChange={(v) => update("cc", v)}
        />

        {error && <div className="modal-error full"><IconAlert size={13} /> {error}</div>}

        <div className="report-editor-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving && <span className="spinner" />}
            {saving ? "Guardando…" : "Guardar informe"}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>Cancelar</button>
        </div>
      </div>

      <div className="report-editor-preview">
        <div className="report-preview-label">
          <IconCheck size={12} /> Así se enviará: cuerpo del correo + informe en PDF adjunto
        </div>

        <div className="dash-tabs" role="tablist" aria-label="Vista previa del envío" style={{ marginBottom: 2 }}>
          <button type="button" role="tab" aria-selected={previewTab === "cuerpo"} className="dash-tab" onClick={() => setPreviewTab("cuerpo")}>
            Cuerpo del correo
          </button>
          <button type="button" role="tab" aria-selected={previewTab === "pdf"} className="dash-tab" onClick={() => setPreviewTab("pdf")}>
            Informe (PDF)
          </button>
        </div>

        {!preview ? (
          <div className="report-preview-placeholder">
            Escribe el prompt y presiona &quot;Generar vista previa&quot; para ver cómo se vería el envío antes de guardar.
          </div>
        ) : previewTab === "cuerpo" ? (
          preview.emailBody ? (
            <div className="report-email-body-preview">{preview.emailBody}</div>
          ) : (
            <div className="report-preview-placeholder">
              Vista previa guardada anteriormente. Genera una nueva para ver el cuerpo del correo.
            </div>
          )
        ) : preview.pdfBase64 ? (
          <iframe title="Vista previa del PDF" src={`data:application/pdf;base64,${preview.pdfBase64}`} className="report-preview-frame" />
        ) : restoringPdf ? (
          <div className="report-preview-placeholder"><span className="spinner" /> Recuperando el PDF guardado…</div>
        ) : (
          <div className="report-preview-placeholder">
            No se pudo recuperar el PDF guardado. Genera una vista previa nueva.
          </div>
        )}
      </div>
    </div>
  );
}
