"use client";

import { useEffect, useState } from "react";
import { previewReportApi, createReportApi, updateReportApi, renderReportPdfApi, sugerirBloquesApi } from "@/lib/api";
import { IconSpark, IconAlert, IconCheck } from "@/components/icons";
import ReportBloqueBuilder, { nuevoBloque, PERIODOS, METRICAS_KPI, AGRUPACIONES } from "@/components/ReportBloqueBuilder";
import ReportBodyEditor from "@/components/ReportBodyEditor";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FRECUENCIAS = [
  { key: "diaria", label: "Diaria" },
  { key: "semanal", label: "Semanal" },
  { key: "mensual", label: "Mensual" },
];

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_SEMANA_VALUE = [1, 2, 3, 4, 5, 6, 0]; // getDay(): 0 = domingo

function emptyForm(report) {
  return {
    nombre: report?.nombre || "",
    prompt: report?.prompt || "",
    bloques: report?.bloques || [],
    periodoGeneral: report?.periodoGeneral || "historico",
    frecuencia: report?.frecuencia || "diaria",
    diaSemana: report?.diaSemana ?? 1,
    diaMes: report?.diaMes ?? 1,
    hora: report?.hora || "07:00",
    sabadoHabil: report?.sabadoHabil ?? false,
    domingoHabil: report?.domingoHabil ?? false,
    destinatarios: report?.destinatarios || [],
    cc: report?.cc || [],
    cuerpoHtml: report?.cuerpoHtml || "",
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
  const [formTab, setFormTab] = useState("informe"); // "informe" | "envio"
  const [previewing, setPreviewing] = useState(false);
  const [restoringPdf, setRestoringPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);

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

  async function handleGenerarBorrador() {
    if (!form.prompt.trim()) return;
    setError("");
    setDraftLoading(true);
    try {
      const res = await previewReportApi({ prompt: form.prompt, nombre: form.nombre });
      const nuevosBloques = (res.content?.secciones || []).map((s) => ({
        ...nuevoBloque("texto"), titulo: s.titulo || "", contenido: s.contenido || "", destacado: s.destacado || "",
      }));
      update("bloques", [...form.bloques, ...nuevosBloques]);
    } catch (err) {
      setError(err.message || "No se pudo generar el borrador.");
    } finally {
      setDraftLoading(false);
    }
  }

  // Botón "Armar informe automáticamente con IA" — sin prompt: la IA analiza
  // los agregados reales y propone qué bloques armar (kpi/gráfico/tabla/texto)
  // y con qué métrica/agrupación. Los valores de esos bloques se siguen
  // calculando 100% determinísticos al generar el informe — la IA solo elige
  // la estructura, nunca una cifra.
  async function handleSugerirInforme() {
    setError("");
    setSugiriendo(true);
    try {
      const res = await sugerirBloquesApi();
      const metricasValidas = new Set(METRICAS_KPI.map((m) => m.key));
      const agrupacionesValidas = new Set(AGRUPACIONES.map((a) => a.key));
      const periodosValidos = new Set(PERIODOS.map((p) => p.key));
      const tiposValidos = new Set(["texto", "kpi", "grafico", "tabla"]);

      const nuevos = (res.bloques || []).map((spec) => {
        const tipo = tiposValidos.has(spec.tipo) ? spec.tipo : "texto";
        const b = nuevoBloque(tipo);
        b.titulo = spec.titulo || "";
        if (tipo === "texto") {
          b.contenido = spec.contenido || spec.justificacion || "";
        } else if (tipo === "kpi") {
          b.metrica = metricasValidas.has(spec.metrica) ? spec.metrica : METRICAS_KPI[0].key;
        } else {
          b.agruparPor = agrupacionesValidas.has(spec.agruparPor) ? spec.agruparPor : "area";
          if (tipo === "grafico") b.metricaAgrupada = spec.metricaAgrupada === "cantidad" ? "cantidad" : "valorConIva";
        }
        return b;
      });

      if (nuevos.length === 0) { setError("La IA no propuso ningún bloque — intenta de nuevo."); return; }
      update("bloques", [...form.bloques, ...nuevos]);
      if (res.periodoSugerido && periodosValidos.has(res.periodoSugerido)) {
        update("periodoGeneral", res.periodoSugerido);
      }
    } catch (err) {
      setError(err.message || "No se pudo generar el informe sugerido.");
    } finally {
      setSugiriendo(false);
    }
  }

  async function handlePreview() {
    if (form.bloques.length === 0) { setError("Agrega al menos un bloque al informe antes de generar la vista previa."); return; }
    setError("");
    setPreviewing(true);
    try {
      const res = await previewReportApi({ bloques: form.bloques, nombre: form.nombre, cuerpoHtml: form.cuerpoHtml, periodoGeneral: form.periodoGeneral });
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
    // Si falta algo, se lleva al usuario a la pestaña donde realmente está
    // ese campo — así el error nunca se queda mostrado debajo de "Armar
    // informe" cuando en realidad es de "Programación" (o viceversa).
    if (!form.nombre.trim()) return setError("Dale un nombre al informe.");
    if (form.bloques.length === 0) { setFormTab("informe"); return setError("Agrega al menos un bloque al informe."); }
    if (!form.destinatarios.length) { setFormTab("programacion"); return setError("Agrega al menos un destinatario en \"Para\"."); }
    if (!preview?.content) { setFormTab("informe"); return setError("Genera la vista previa antes de guardar, para confirmar cómo se verá el correo."); }

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
        {sugiriendo && (
          <div className="report-editor-form-overlay">
            <span className="spinner" />
            Analizando tus datos y armando el informe… espera un momento, no se puede editar mientras tanto.
          </div>
        )}
        <div className="field full">
          <label htmlFor="rp-nombre">Nombre del informe *</label>
          <input id="rp-nombre" value={form.nombre} onChange={(e) => update("nombre", e.target.value)} placeholder="Ej. Resumen semanal de compras" />
        </div>

        <div className="dash-tabs" role="tablist" aria-label="Secciones del informe">
          <button type="button" role="tab" aria-selected={formTab === "cuerpo"} className="dash-tab" onClick={() => { setFormTab("cuerpo"); setError(""); }} disabled={sugiriendo}>
            Cuerpo del correo
          </button>
          <button type="button" role="tab" aria-selected={formTab === "informe"} className="dash-tab" onClick={() => { setFormTab("informe"); setError(""); }} disabled={sugiriendo}>
            Armar informe
          </button>
          <button type="button" role="tab" aria-selected={formTab === "programacion"} className="dash-tab" onClick={() => { setFormTab("programacion"); setError(""); }} disabled={sugiriendo}>
            Programación
          </button>
        </div>

        {formTab === "informe" ? (
          <>
            <div className="field full">
              <button type="button" className="btn btn-sync" onClick={handleSugerirInforme} disabled={sugiriendo}>
                {sugiriendo ? <span className="spinner" /> : <IconSpark size={14} />}
                {sugiriendo ? "Analizando tus datos…" : "Armar informe automáticamente con IA"}
              </button>
              <p className="schedule-note" style={{ marginTop: 8 }}>
                Analiza tus datos reales y propone qué bloques armar (KPI, Gráfico, Tabla) según lo que de verdad
                destaca — los agrega a la lista de abajo para que los revises, edites o borres. No inventa cifras: la
                IA solo elige la estructura, los valores se calculan igual que en cualquier bloque manual.
              </p>
            </div>

            <div className="field full">
              <label htmlFor="rp-periodo">Periodo de los datos (aplica a todo el informe)</label>
              <select id="rp-periodo" value={form.periodoGeneral} onChange={(e) => update("periodoGeneral", e.target.value)}>
                {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <p className="schedule-note" style={{ marginTop: 8 }}>
                Se aplica a todos los bloques de KPI, Gráfico y Tabla por igual — se recalcula relativo a la fecha de
                envío, no es una fecha fija (p. ej. un envío mensual con "Mes anterior" siempre toma el mes antes de
                cada envío).
              </p>
            </div>

            <div className="field full">
              <label>Bloques del informe *</label>
              <ReportBloqueBuilder bloques={form.bloques} onChange={(bloques) => update("bloques", bloques)} />
            </div>

            <details className="ia-draft-details">
              <summary><IconSpark size={12} /> Generar un borrador con IA a partir de un prompt (opcional)</summary>
              <textarea
                rows={3} value={form.prompt} onChange={(e) => update("prompt", e.target.value)}
                placeholder="Ej. Resume el total comprado por área, destaca las compras sin legalizar y muestra el cumplimiento de tiempos de entrega."
              />
              <button type="button" className="btn btn-sync small" onClick={handleGenerarBorrador} disabled={draftLoading || !form.prompt.trim() || sugiriendo}>
                {draftLoading ? <span className="spinner" /> : <IconSpark size={12} />}
                {draftLoading ? "Generando borrador…" : "Agregar bloques de texto con IA"}
              </button>
              <p className="schedule-note">
                Agrega bloques de texto editables a partir del prompt — luego puedes editarlos, moverlos o borrarlos, y
                complementarlos con bloques de Gráfico/Tabla/KPI calculados exactos sobre los datos reales (sin IA).
              </p>
            </details>

            <div className="field full">
              <button type="button" className="btn btn-sync" onClick={handlePreview} disabled={previewing || sugiriendo}>
                {previewing ? <span className="spinner" /> : <IconSpark size={14} />}
                {previewing ? "Generando vista previa…" : "Generar vista previa"}
              </button>
              {previewing && <p className="schedule-note" style={{ marginTop: 6 }}>Puede tardar hasta 1-2 minutos con informes grandes.</p>}
            </div>

          </>
        ) : formTab === "cuerpo" ? (
          <>
            <div className="field full">
              <label>Cuerpo del correo (el informe completo va adjunto en PDF aparte)</label>
              <ReportBodyEditor value={form.cuerpoHtml} onChange={(html) => update("cuerpoHtml", html)} disabled={saving} />
            </div>
          </>
        ) : (
          <>
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

          </>
        )}

        {error && <div className="modal-error full"><IconAlert size={13} /> {error}</div>}

        <div className="report-editor-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || sugiriendo}>
            {saving && <span className="spinner" />}
            {saving ? "Guardando…" : "Guardar informe"}
          </button>
          <button type="button" className="btn" onClick={onCancel} disabled={saving || sugiriendo}>Cancelar</button>
        </div>
      </div>

      <div className="report-editor-preview">
        <div className="report-preview-label">
          <IconCheck size={12} /> Así se enviará: cuerpo del correo + informe en PDF adjunto
        </div>

        <div className="field full" style={{ marginBottom: 2 }}>
          <button type="button" className="btn btn-sync" onClick={handlePreview} disabled={previewing || sugiriendo}>
            {previewing ? <span className="spinner" /> : <IconSpark size={14} />}
            {previewing ? "Generando vista previa…" : "Generar vista previa"}
          </button>
          {previewing && <p className="schedule-note" style={{ marginTop: 6 }}>Puede tardar hasta 1-2 minutos con informes grandes.</p>}
        </div>

        <div className="dash-tabs" role="tablist" aria-label="Vista previa del envío" style={{ marginBottom: 2 }}>
          <button type="button" role="tab" aria-selected={previewTab === "cuerpo"} className="dash-tab" onClick={() => setPreviewTab("cuerpo")}>
            Cuerpo del correo
          </button>
          <button type="button" role="tab" aria-selected={previewTab === "pdf"} className="dash-tab" onClick={() => setPreviewTab("pdf")}>
            Informe (PDF)
          </button>
        </div>

        {previewTab === "cuerpo" ? (
          form.cuerpoHtml?.trim() ? (
            <div className="report-email-body-preview" dangerouslySetInnerHTML={{ __html: form.cuerpoHtml }} />
          ) : (
            <div className="report-preview-placeholder">
              Escribe el cuerpo del correo en la pestaña &quot;Cuerpo del correo&quot; — se ve aquí tal cual, sin esperar a generar nada.
            </div>
          )
        ) : !preview ? (
          <div className="report-preview-placeholder">
            Agrega bloques y presiona &quot;Generar vista previa&quot; para ver cómo se vería el envío antes de guardar.
          </div>
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
