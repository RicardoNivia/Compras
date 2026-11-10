import { jsPDF } from "jspdf";
import { saveBlob } from "@/lib/exportHelpers";
import { urlFoto } from "@/lib/api";
import { fechaLarga, LOGO } from "@/components/bienestar/historias/comun";

// PDF de Historias: una portada con las cifras del año y una hoja A4 horizontal por jornada (fotos, personas, voces y
// lo que vio Nova). Las fotos se piden con la sesión de quien descarga y se pasan por un canvas a JPEG, así jsPDF las
// acepta vengan como vengan (JPEG, PNG o WebP).

const NAVY = [15, 34, 56];
const AZUL = [37, 102, 165];
const MAGENTA = [228, 18, 127];
const GRIS = [74, 91, 112];
const entero = (v) => Math.round(v || 0).toLocaleString("es-CO");

async function imagen(url, maxLado = 1400) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const k = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height };
}

// Dibuja la imagen cubriendo el recuadro (recortada al centro, como object-fit: cover).
function cubrir(doc, img, x, y, w, h) {
  const k = Math.max(w / img.w, h / img.h);
  const iw = img.w * k;
  const ih = img.h * k;
  doc.saveGraphicsState();
  doc.roundedRect(x, y, w, h, 3, 3, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(img.data, "JPEG", x - (iw - w) / 2, y - (ih - h) / 2, iw, ih);
  doc.restoreGraphicsState();
}

function vacio(doc, x, y, w, h, texto) {
  doc.setFillColor(255, 240, 246);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  doc.setTextColor(...MAGENTA);
  doc.setFontSize(11);
  doc.text(texto, x + w / 2, y + h / 2, { align: "center", baseline: "middle" });
}

function pie(doc, n, total) {
  doc.setDrawColor(220, 229, 238);
  doc.line(16, 198, 281, 198);
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text("Sincosoft · Fundación Proyecto Unión", 16, 203);
  doc.text(`Página ${n} de ${total}`, 281, 203, { align: "right" });
}

export async function generarPdfHistorias(datos) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logo = await imagen(LOGO, 900).catch(() => null);
  const total = datos.jornadas.length + 1;
  const t = datos.totales;

  // Portada
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 297, 210, "F");
  if (logo) {
    const w = 120;
    const h = (logo.h / logo.w) * w;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(148.5 - w / 2 - 8, 30, w + 16, h + 14, 5, 5, "F");
    doc.addImage(logo.data, "JPEG", 148.5 - w / 2, 37, w, h);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text(`Historias ${datos.anio}`, 148.5, 122, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(201, 214, 229);
  doc.text("Las jornadas de Conectando Corazones, contadas con sus fotos y sus voces", 148.5, 132, { align: "center" });
  const cifras = [[entero(t.jornadas), "jornadas realizadas"], [entero(t.personas), "personas acompañaron"], [entero(t.vocesAFavor), "voces a favor"], [entero(t.fotos), "fotos"]];
  cifras.forEach(([v, l], i) => {
    const x = 38 + i * 57;
    doc.setFillColor(30, 52, 78);
    doc.roundedRect(x, 146, 50, 30, 4, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(v, x + 25, 160, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(201, 214, 229);
    doc.text(l, x + 25, 169, { align: "center" });
  });
  if (t.frase) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(230, 238, 246);
    doc.text(doc.splitTextToSize(`“${t.frase.texto}”`, 220).slice(0, 2), 148.5, 190, { align: "center" });
  }

  // Una hoja por jornada
  for (const [i, j] of datos.jornadas.entries()) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Conectando Corazones · Historias " + datos.anio, 16, 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS);
    doc.text(`Jornada ${i + 1} de ${datos.jornadas.length}`, 281, 16, { align: "right" });
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.6);
    doc.line(16, 20, 281, 20);
    doc.setLineWidth(0.2);

    // Fotos (izquierda): una grande y hasta dos pequeñas.
    const fotos = await Promise.all(j.fotos.slice(0, 3).map((f) => imagen(urlFoto(j.id, f.id)).catch(() => null)));
    const [f0, f1, f2] = fotos;
    if (f0) cubrir(doc, f0, 16, 26, 140, 104); else vacio(doc, 16, 26, 140, 104, "Esta jornada aún no tiene fotos");
    if (f1) cubrir(doc, f1, 16, 134, 68, 58);
    if (f2) cubrir(doc, f2, 88, 134, 68, 58);

    // Texto (derecha)
    const x = 166;
    const ancho = 115;
    let y = 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...AZUL);
    doc.text(fechaLarga(j.fecha).toUpperCase(), x, y);
    y += 8;
    doc.setFontSize(19);
    doc.setTextColor(...NAVY);
    const titulo = doc.splitTextToSize(j.nombre, ancho).slice(0, 3);
    doc.text(titulo, x, y);
    y += titulo.length * 8 + 4;

    const cajas = [
      j.asistentes != null ? [entero(j.asistentes), "acompañaron"] : null,
      j.asistencia != null ? [`${(j.asistencia * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`, "de los inscritos"] : null,
      j.calificaciones.total ? [`${j.calificaciones.promedio.toLocaleString("es-CO", { maximumFractionDigits: 1 })} de 5`, `${j.calificaciones.total} calificación(es)`] : null,
      j.nova?.puntaje != null ? [`${j.nova.puntaje} de 5`, "puntaje de Nova"] : null,
    ].filter(Boolean);
    cajas.slice(0, 3).forEach(([v, l], k) => {
      const cx = x + k * 39;
      doc.setFillColor(243, 247, 251);
      doc.roundedRect(cx, y, 36, 20, 2.5, 2.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...NAVY);
      doc.text(v, cx + 4, y + 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(l, cx + 4, y + 15.5);
    });
    if (cajas.length) y += 28;

    if (j.comentarios.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GRIS);
      doc.text(`COMENTARIOS · ${j.tonos.aFavor} a favor · ${j.tonos.neutros} neutros · ${j.tonos.enContra} en contra`, x, y);
      y += 6;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10.5);
      doc.setTextColor(58, 15, 36);
      for (const v of j.comentarios.slice(0, 3)) {
        const lineas = doc.splitTextToSize(`“${v.texto}”`, ancho - 6).slice(0, 3);
        if (y + lineas.length * 5 > 170) break;
        doc.setDrawColor(...MAGENTA);
        doc.setLineWidth(0.9);
        doc.line(x, y - 3.5, x, y - 3.5 + lineas.length * 5);
        doc.setLineWidth(0.2);
        doc.text(lineas, x + 4, y);
        y += lineas.length * 5 + 4;
      }
    }

    if (j.nova?.frase && y < 178) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      const nova = doc.splitTextToSize(`${j.nova.titulo ? `${j.nova.titulo}. ` : ""}${j.nova.frase}`, ancho);
      doc.setFont("helvetica", "normal");
      doc.text(nova.slice(0, Math.max(1, Math.floor((192 - y) / 4.5))), x, y + 2);
    }
    pie(doc, i + 2, total);
  }
  doc.setPage(1);
  pie(doc, 1, total);

  saveBlob(`historias-conectando-corazones-${datos.anio}.pdf`, doc.output("blob"));
}
