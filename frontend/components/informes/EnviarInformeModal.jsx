"use client";

import { useEffect, useState } from "react";
import { fetchEdicionApi, edicionPdfUrl, marcarEdicionEnviadaApi } from "@/lib/api";
import { IconDownload, IconMail, IconCopy, IconCheck, IconAlert } from "@/components/icons";

// "Lo envío yo": mientras no haya correo automático, el responsable envía el informe desde su Outlook. Tres pasos:
// descargar el PDF ya generado, abrir el correo ya escrito (destinatarios, asunto y mensaje) y adjuntar el PDF.
// Outlook no deja que otra aplicación adjunte archivos, por eso el tercer paso es manual. Al final, "Ya lo envié"
// deja la edición como enviada (queda en la actividad del informe y en Auditoría).
// Lo usan Mi día, el inicio del Estudio y la pestaña Historial de envíos.

const MAX_MAILTO = 1800; // los clientes de correo cortan los enlaces mailto muy largos

function mailtoDe(ed) {
  const qs = [];
  if (ed.cc?.length) qs.push(`cc=${encodeURIComponent(ed.cc.join(","))}`);
  qs.push(`subject=${encodeURIComponent(ed.asunto || "")}`);
  let cuerpo = ed.mensaje || "";
  if (cuerpo.length > MAX_MAILTO) cuerpo = `${cuerpo.slice(0, MAX_MAILTO)}…`;
  qs.push(`body=${encodeURIComponent(cuerpo)}`);
  return `mailto:${(ed.destinatarios || []).map(encodeURIComponent).join(",")}?${qs.join("&")}`;
}

export default function EnviarInformeModal({ edicionId, onClose, onEnviado }) {
  const [ed, setEd] = useState(null);
  const [error, setError] = useState("");
  const [descargado, setDescargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchEdicionApi(edicionId)
      .then((d) => { if (vivo) { setEd(d); setDescargado(!!d.descargadoAt); } })
      .catch((e) => { if (vivo) setError(e.message || "No se pudo cargar el informe."); });
    return () => { vivo = false; };
  }, [edicionId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copiar() {
    const texto = `Para: ${(ed.destinatarios || []).join(", ")}${ed.cc?.length ? `\nCC: ${ed.cc.join(", ")}` : ""}\nAsunto: ${ed.asunto}\n\n${ed.mensaje}`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      setError("No se pudo copiar. Selecciona el texto del correo y cópialo a mano.");
    }
  }

  async function yaLoEnvie() {
    setGuardando(true);
    setError("");
    try {
      const upd = await marcarEdicionEnviadaApi(edicionId);
      onEnviado?.(upd);
      onClose();
    } catch (e) {
      setError(e.message || "No se pudo marcar como enviado.");
      setGuardando(false);
    }
  }

  const yaEnviado = ed?.estado === "enviado";

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal est-envio" role="dialog" aria-modal="true" aria-labelledby="envia-t">
        <div className="est-envio-head">
          <span className="est-pdf-thumb" style={{ width: 46, height: 60 }} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="envia-t" style={{ margin: 0, fontFamily: "Nunito, sans-serif", fontSize: 19 }}>
              {ed ? `Envía el informe de ${ed.periodoLabel}` : "Envía el informe"}
            </h3>
            <p className="est-sub">
              {ed ? <>{ed.reportNombre} · generado el {new Date(ed.createdAt).toLocaleString("es-CO", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}{ed.origen === "prueba" ? " · prueba, solo para ti" : ""}</> : "Cargando…"}
            </p>
          </div>
          <button type="button" className="btn btn-ghost est-ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {!ed && !error && <div style={{ padding: 30, display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /> Preparando el informe…</div>}

        {ed && (
          <div style={{ padding: "4px 24px 8px" }}>
            {yaEnviado && (
              <div className="est-verificada" style={{ margin: "14px 0 4px" }}>
                <IconCheck size={16} /> <span>Ya está enviado{ed.enviadoPorNombre ? ` (por ${ed.enviadoPorNombre})` : ""}. Puedes volver a descargarlo cuando quieras.</span>
              </div>
            )}
            <div className="est-paso">
              <span className={`est-paso-n${descargado ? " ok" : ""}`} aria-hidden="true">{descargado ? "✓" : "1"}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <strong>Descarga el PDF</strong>
                <span className="est-sub" style={{ margin: 0 }}>{descargado ? <>Descargado: <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{ed.archivo}</span></> : "El informe tal como se generó, listo para adjuntar."}</span>
              </div>
              <a className={`btn${descargado ? "" : " btn-primary"}`} href={edicionPdfUrl(ed.id)} download={ed.archivo} onClick={() => setDescargado(true)}>
                <IconDownload size={14} /> {descargado ? "Descargar de nuevo" : "Descargar PDF"}
              </a>
            </div>

            <div className="est-paso">
              <span className={`est-paso-n${abierto ? " ok" : ""}`} aria-hidden="true">{abierto ? "✓" : "2"}</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <strong>Abre el correo ya escrito</strong>
                <div className="est-correo">
                  <span className="muted">Para:</span> {(ed.destinatarios || []).join(", ") || <em className="muted">sin destinatarios</em>}
                  {ed.cc?.length ? <><br /><span className="muted">CC:</span> {ed.cc.join(", ")}</> : null}
                  <br /><span className="muted">Asunto:</span> <strong>{ed.asunto}</strong>
                  {"\n\n"}{ed.mensaje}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a className="btn btn-primary" href={mailtoDe(ed)} onClick={() => setAbierto(true)}><IconMail size={14} /> Abrir en Outlook</a>
                  <button type="button" className="btn" onClick={copiar}><IconCopy size={14} /> {copiado ? "¡Copiado!" : "Copiar todo"}</button>
                </div>
              </div>
            </div>

            <div className="est-paso">
              <span className="est-paso-n" aria-hidden="true">3</span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <strong>Adjunta el PDF y envía</strong>
                <span className="est-sub" style={{ margin: 0 }}>Outlook no permite que otra aplicación adjunte archivos por ti: arrastra el PDF descargado al correo y presiona Enviar.</span>
              </div>
            </div>
          </div>
        )}

        {error && <div className="modal-error" style={{ padding: "0 24px 12px" }}><IconAlert size={13} /> {error}</div>}

        <div className="modal-foot" style={{ background: "var(--surface-2)" }}>
          <button type="button" className="btn btn-ghost est-ghost" onClick={onClose}>{yaEnviado ? "Cerrar" : "Lo envío más tarde"}</button>
          <div className="spacer" />
          {ed && !yaEnviado && (
            <button type="button" className="btn btn-primary" onClick={yaLoEnvie} disabled={guardando}>
              {guardando ? <span className="spinner" /> : <IconCheck size={14} />} Ya lo envié
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
