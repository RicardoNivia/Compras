"use client";

import { useRef, useState } from "react";
import { IconFile, IconCheck, IconAlert } from "@/components/icons";
import { isLikelyInvoice, parseInvoiceFields } from "@/lib/invoiceParser";

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

// Apartado de IA en el formulario: el usuario sube una imagen o PDF de una
// factura, se le hace OCR en el navegador (Tesseract.js) y, si el texto
// detectado realmente parece una factura, se proponen valores para los
// campos del formulario. Nunca guarda nada — solo llena el formulario para
// que el usuario revise y decida si guardar.
export default function InvoiceScanner({ onExtract, disabled }) {
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | reading | ocr | done | rejected | error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [foundLabels, setFoundLabels] = useState([]);

  async function handleFile(file) {
    if (!file) return;
    setStatus("reading");
    setProgress(0);
    setMessage("");
    setFoundLabels([]);
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const canvas = isPdf ? await pdfToCanvas(file) : await imageToCanvas(file);

      setStatus("ocr");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("spa+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") setProgress(Math.round((m.progress || 0) * 100));
        },
      });
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      const text = data.text || "";

      if (!isLikelyInvoice(text)) {
        setStatus("rejected");
        setMessage("Esto no parece ser una factura. Sube una imagen o PDF de una factura válida.");
        return;
      }

      const { fields, foundLabels: labels } = parseInvoiceFields(text);
      if (labels.length === 0) {
        setStatus("rejected");
        setMessage("Se detectó una factura, pero no se pudo leer ningún dato con claridad. Diligencia el formulario manualmente.");
        return;
      }

      onExtract(fields);
      setFoundLabels(labels);
      setStatus("done");
      setMessage("Datos extraídos de la factura. Revísalos antes de guardar — ningún dato se guarda automáticamente.");
    } catch (err) {
      setStatus("error");
      setMessage("No se pudo leer el archivo. Intenta con otra imagen o PDF.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = status === "reading" || status === "ocr";

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
              ? status === "reading" ? "Leyendo archivo…" : `Analizando factura… ${progress}%`
              : <>Llenar con una factura <span className="invoice-scanner-badge">IA</span></>}
          </p>
          <p className="invoice-scanner-sub">Sube una imagen o PDF de la factura — se valida y se proponen los datos, tú revisas y guardas.</p>
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
