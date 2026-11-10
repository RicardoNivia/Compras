"use client";

import { useEffect, useState } from "react";
import { renderReportPdfApi } from "@/lib/api";
import { IconDownload, IconAlert } from "@/components/icons";

// Vista previa = el PDF real: se dibuja con el mismo motor que el envío (backend/lib/reportPdf.js) a partir del
// contenido que ya muestra el editor, así que lo que se ve aquí es exactamente lo que se descarga y se envía.

export default function VistaPreviaPdf({ informe, content, onClose, onProgramar }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    let objectUrl = null;
    renderReportPdfApi({ content, nombre: informe.nombre, periodoGeneral: informe.periodoGeneral, contexto: informe.contexto, prioridad: "media" })
      .then(({ pdfBase64 }) => {
        if (!vivo) return;
        const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setUrl(objectUrl);
      })
      .catch((e) => { if (vivo) setError(e.message || "No se pudo generar el PDF."); });
    return () => { vivo = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [content, informe.nombre, informe.periodoGeneral, informe.contexto]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const archivo = `${(informe.nombre || "Informe").replace(/[^\wÁÉÍÓÚáéíóúÑñ\- ]+/g, "").trim().replace(/\s+/g, "-")}.pdf`;

  return (
    <div className="est-viewer" role="dialog" aria-modal="true" aria-label="Vista previa del PDF">
      <div className="est-viewer-bar">
        <button type="button" className="est-vbtn" onClick={onClose}>← Volver a editar</button>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong>{informe.nombre}</strong>
          <small>Vista previa · es exactamente el PDF que se descarga y se envía</small>
        </div>
        <div className="spacer" />
        {url && <a className="est-vbtn" href={url} download={archivo}><IconDownload size={15} /> Descargar PDF</a>}
        <button type="button" className="btn btn-nova" onClick={onProgramar}>Programar envío</button>
      </div>
      {error ? (
        <div className="est-viewer-vacio"><IconAlert size={16} /> {error}</div>
      ) : url ? (
        <iframe src={url} title="PDF del informe" />
      ) : (
        <div className="est-viewer-vacio"><span className="spinner" /> Dibujando el PDF…</div>
      )}
    </div>
  );
}
