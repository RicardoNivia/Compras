"use client";

import { useEffect, useRef, useState } from "react";
import { generateCuerpoCorreoIaApi } from "@/lib/api";
import { IconSpark, IconAlert, IconCheck } from "@/components/icons";

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Convierte una respuesta de texto plano de la IA (párrafos separados por
// línea en blanco) a HTML simple de párrafos, para insertarla en el editor.
function textoAHtml(texto) {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const TOOLBAR = [
  { cmd: "bold", label: "N", title: "Negrita" },
  { cmd: "italic", label: "I", title: "Cursiva" },
  { cmd: "underline", label: "S", title: "Subrayado" },
  { cmd: "insertUnorderedList", label: "•", title: "Lista con viñetas" },
  { cmd: "insertOrderedList", label: "1.", title: "Lista numerada" },
  { cmd: "removeFormat", label: "✕", title: "Quitar formato" },
];

// Editor de texto enriquecido para el cuerpo del correo, al estilo de un
// correo nuevo en Outlook: el usuario escribe y da formato directamente (sin
// prompt ni generación por IA) — el botón "IA" es opcional y solo revisa o
// reescribe lo que ya está escrito, nunca genera contenido desde cero.
export default function ReportBodyEditor({ value, onChange, disabled }) {
  const editorRef = useRef(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError] = useState("");
  const [sugerencia, setSugerencia] = useState(null); // texto propuesto por la IA, pendiente de aceptar/descartar
  const loadedValueRef = useRef(null);

  // Solo se sincroniza el HTML del editor cuando "value" cambia por fuera
  // (p.ej. al abrir "Editar informe") — nunca en cada tecla, o el cursor
  // saltaría al inicio en cada render.
  useEffect(() => {
    if (editorRef.current && loadedValueRef.current !== value) {
      editorRef.current.innerHTML = value || "";
      loadedValueRef.current = value;
    }
  }, [value]);

  function handleInput() {
    const html = editorRef.current?.innerHTML || "";
    loadedValueRef.current = html;
    onChange(html);
  }

  function exec(cmd) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
    handleInput();
  }

  async function handleMejorarConIa() {
    const textoActual = (editorRef.current?.innerText || "").trim();
    if (!textoActual) {
      setIaError("Escribe algo en el cuerpo del correo antes de pedirle a la IA que lo revise.");
      return;
    }
    setIaError("");
    setIaLoading(true);
    try {
      const res = await generateCuerpoCorreoIaApi({ texto: textoActual });
      setSugerencia(res.texto);
    } catch (err) {
      setIaError(err.message || "No se pudo generar una sugerencia.");
    } finally {
      setIaLoading(false);
    }
  }

  function aplicarSugerencia() {
    if (!editorRef.current || !sugerencia) return;
    editorRef.current.innerHTML = textoAHtml(sugerencia);
    handleInput();
    setSugerencia(null);
  }

  return (
    <div className="body-editor">
      <div className="body-editor-toolbar">
        {TOOLBAR.map((t) => (
          <button key={t.cmd} type="button" title={t.title} onClick={() => exec(t.cmd)} disabled={disabled}>
            {t.label}
          </button>
        ))}
        <div className="spacer" />
        <button type="button" className="btn btn-sync small" onClick={handleMejorarConIa} disabled={disabled || iaLoading}>
          {iaLoading ? <span className="spinner" /> : <IconSpark size={12} />}
          {iaLoading ? "Revisando…" : "IA"}
        </button>
      </div>

      <div
        ref={editorRef}
        className="body-editor-area"
        contentEditable={!disabled}
        onInput={handleInput}
        suppressContentEditableWarning
        data-placeholder="Escribe aquí el cuerpo del correo — el informe completo va adjunto en PDF…"
      />

      {iaError && <div className="modal-error" style={{ marginTop: 6 }}><IconAlert size={13} /> {iaError}</div>}

      {sugerencia && (
        <div className="body-editor-sugerencia">
          <p className="body-editor-sugerencia-title"><IconSpark size={12} /> Redacción sugerida por la IA</p>
          <div className="body-editor-sugerencia-texto">{sugerencia}</div>
          <div className="body-editor-sugerencia-actions">
            <button type="button" className="btn small" onClick={() => setSugerencia(null)}>Descartar</button>
            <button type="button" className="btn btn-primary small" onClick={aplicarSugerencia}>
              <IconCheck size={11} /> Usar esta redacción
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
