"use client";

import { useRef, useState } from "react";
import { IconFile, IconCheck, IconAlert } from "@/components/icons";
import { invoiceExtractApi } from "@/lib/api";

// Renderiza la primera página de un PDF a un canvas usando pdfjs-dist
// (cargado dinámicamente: solo se necesita en el navegador, al usar esta
// función, nunca durante el build/SSR).
async function pdfToCanvas(file) {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

function imageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Nova lee la imagen directamente (visión), no hace falta más resolución que
// esto para leer texto de factura con claridad — limita el tamaño del
// payload (y el costo/tiempo de la llamada) sin perder legibilidad.
const MAX_DIM = 1700;

function canvasToJpegBase64(canvas) {
  let source = canvas;
  if (canvas.width > MAX_DIM || canvas.height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(canvas.width, canvas.height);
    const resized = document.createElement("canvas");
    resized.width = Math.round(canvas.width * scale);
    resized.height = Math.round(canvas.height * scale);
    resized.getContext("2d").drawImage(canvas, 0, 0, resized.width, resized.height);
    source = resized;
  }
  const dataUrl = source.toDataURL("image/jpeg", 0.88);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

// Apartado de IA en el formulario: el usuario sube una imagen o PDF de una
// factura y Nova (visión de Anthropic, ver app/api/agent/invoice-extract/route.js)
// la lee directamente — más preciso que un OCR + reglas de texto porque
// entiende el layout de la factura, no solo el texto plano. Nunca guarda
// nada — solo llena el formulario para que el usuario revise y decida si guardar.
export default function InvoiceScanner({ onExtract, disabled }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | reading | analyzing | done | rejected | error
  const [message, setMessage] = useState("");
  const [foundLabels, setFoundLabels] = useState([]);

  async function handleFile(file) {
    if (!file) return;
    setStatus("reading");
    setMessage("");
    setFoundLabels([]);
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const canvas = isPdf ? await pdfToCanvas(file) : await imageToCanvas(file);
      const imageBase64 = canvasToJpegBase64(canvas);

      setStatus("analyzing");
      const result = await invoiceExtractApi({ imageBase64, mimeType: "image/jpeg" });

      if (!result.esFactura) {
        setStatus("rejected");
        setMessage("Esto no parece ser una factura. Sube una imagen o PDF de una factura válida.");
        return;
      }
      if (Object.keys(result.fields || {}).length === 0) {
        setStatus("rejected");
        setMessage("Se detectó una factura, pero no se pudo leer ningún dato con claridad. Diligencia el formulario manualmente.");
        return;
      }

      onExtract(result.fields);
      setFoundLabels(result.foundLabels || []);
      setStatus("done");
      setMessage("Datos extraídos de la factura. Revísalos antes de guardar — ningún dato se guarda automáticamente.");
    } catch (err) {
      setStatus("error");
      setMessage(err.message || "No se pudo leer el archivo. Intenta con otra imagen o PDF.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = status === "reading" || status === "analyzing";

  return (
    <div className="invoice-scanner">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={disabled || busy}
        id="invoice-scanner-input"
        className="invoice-scanner-input"
      />
      <label htmlFor="invoice-scanner-input" className={`invoice-scanner-box${busy ? " busy" : ""}`}>
        <span className="invoice-scanner-ic"><IconFile size={17} /></span>
        <div>
          <p className="invoice-scanner-title">
            {busy
              ? status === "reading" ? "Preparando archivo…" : "Nova está leyendo la factura…"
              : <>Llenar con factura con <span className="invoice-scanner-nova">Nova</span></>}
          </p>
          <p className="invoice-scanner-sub">Sube una imagen o PDF de la factura — Nova la lee, propone los datos y tú revisas y guardas.</p>
        </div>
      </label>

      {status === "done" && (
        <div className="invoice-scanner-msg ok">
          <IconCheck size={13} />
          <div>
            <p>{message}</p>
            {foundLabels.length > 0 && <p className="invoice-scanner-fields">Se propuso: {foundLabels.join(", ")}.</p>}
          </div>
        </div>
      )}
      {(status === "rejected" || status === "error") && (
        <div className="invoice-scanner-msg warn">
          <IconAlert size={13} />
          <p>{message}</p>
        </div>
      )}
    </div>
  );
}
