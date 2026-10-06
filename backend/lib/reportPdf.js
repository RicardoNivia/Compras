import PDFDocument from "pdfkit";

// Mismos colores que usa el Dashboard para estado de compra/legalización
// (ver maestros reales: tipo "estado" = Pendiente/Proceso/Ejecutado/Anulado;
// tipo "estadoLegalizacion" = Acta/OC/N/A/Legalizado/Rechazado/Pendiente) —
// si la etiqueta de una barra coincide con alguno, usa ese color; si no, cae
// al azul de marca (ACCENT_HEX).
const ESTADO_COLOR_HEX = {
  "Pendiente": "#fb8500",
  "Proceso": "#00bcd4",
  "Ejecutado": "#60a918",
  "Anulado": "#d14343",
  "Legalizado": "#60a918",
  "Rechazado": "#d14343",
};
const ACCENT_HEX = "#2063a0";

const MARGIN = 50;
const ROW_H = 24;
const TABLA_ROW_H = 18;

function fmtNum(n) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
}

// Texto plano a partir del contenido de una sección — igual que
// contentToHtml (reportContent.js) pero para dibujar en el PDF: las viñetas
// "- " se cambian por "•" en vez de una lista HTML.
function contentPlain(text) {
  return String(text || "")
    .split(/\n+/).map((l) => l.trim()).filter(Boolean)
    .map((l) => (l.startsWith("- ") ? `•  ${l.slice(2)}` : l))
    .join("\n");
}

// Altura que va a ocupar una sección completa (título + destacado + texto +
// gráfica) ANTES de dibujarla — se usa para decidir si hace falta saltar de
// página primero, así una sección (y su gráfica) nunca queda partida entre
// dos páginas.
function measureSection(doc, s, width) {
  let h = 0;
  doc.font("Helvetica-Bold").fontSize(13);
  h += doc.heightOfString(s.titulo || "", { width }) + 4;
  if (s.destacado) h += 24;
  doc.font("Helvetica").fontSize(10.5);
  h += doc.heightOfString(contentPlain(s.contenido), { width }) + 6;
  if (s.grafico?.datos?.length) {
    h += 16 + Math.min(s.grafico.datos.length, 8) * ROW_H;
  }
  if (s.tabla?.filas?.length) {
    h += 10 + 14 + 6 + measureTablaFilas(doc, s.tabla, width - 14).reduce((a, b) => a + b, 0);
  }
  return h + 26; // aire extra arriba/abajo de la sección
}

// Alto real de cada fila de una tabla — una celda larga (proveedor, texto de
// justificante, etc.) puede envolver a 2-3 líneas dentro de su columna, así
// que no se puede asumir una altura fija por fila (ver bug: filas de distinto
// alto se superponían entre sí y con la siguiente sección porque measureSection
// y drawTabla usaban TABLA_ROW_H fijo sin medir el texto real).
function measureTablaFilas(doc, tabla, width) {
  const cols = Math.max(1, tabla.columnas.length);
  const colWidth = width / cols;
  doc.font("Helvetica").fontSize(9.5);
  return tabla.filas.slice(0, 15).map((fila) => {
    let maxH = TABLA_ROW_H;
    for (let i = 0; i < cols; i++) {
      const h = doc.heightOfString(String(fila[i] ?? "—"), { width: colWidth - 8 }) + 7;
      if (h > maxH) maxH = h;
    }
    return maxH;
  });
}

function drawGrafico(doc, grafico, width) {
  const startX = doc.x;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#5a6b85")
    .text((grafico.titulo || "").toUpperCase(), { width, characterSpacing: 0.3 });
  doc.moveDown(0.3);

  const datos = grafico.datos.slice(0, 8);
  const max = Math.max(...datos.map((d) => d.valor || 0), 1);
  const labelW = Math.min(130, width * 0.3);
  const valueW = 85;
  const barW = width - labelW - valueW - 16;
  const barX = startX + labelW + 8;

  for (const d of datos) {
    const rowY = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor("#33425b")
      .text(d.etiqueta, startX, rowY + 3, { width: labelW, height: 14, ellipsis: true });

    const trackH = 13;
    doc.roundedRect(barX, rowY + 2, barW, trackH, 4).fill("#e4ecf4");
    const pct = Math.max(0.03, (d.valor || 0) / max);
    const color = ESTADO_COLOR_HEX[d.etiqueta] || ACCENT_HEX;
    doc.roundedRect(barX, rowY + 2, Math.max(8, barW * pct), trackH, 4).fill(color);

    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#132a46")
      .text(fmtNum(d.valor), barX + barW + 8, rowY + 3, { width: valueW, align: "right" });

    doc.x = startX;
    doc.y = rowY + ROW_H;
  }
}

// Tabla simple (encabezado + filas de texto) para secciones que comparan
// varias columnas a la vez (ej. presupuesto vs. gastado vs. % por área) —
// ver TABLA_SCHEMA en reportContent.js. Columnas de ancho igual; la primera
// columna (normalmente el nombre del área/categoría) se alinea a la
// izquierda, el resto a la derecha (son casi siempre cifras).
function drawTabla(doc, tabla, width) {
  const cols = Math.max(1, tabla.columnas.length);
  const colWidth = width / cols;
  const startX = doc.x;
  let y = doc.y;

  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#5a6b85");
  tabla.columnas.forEach((c, i) => {
    doc.text(String(c).toUpperCase(), startX + i * colWidth, y, { width: colWidth - 8, align: i === 0 ? "left" : "right" });
  });
  y += 14;
  doc.moveTo(startX, y).lineTo(startX + width, y).strokeColor("#e4ecf4").lineWidth(1).stroke();
  y += 6;

  const filas = tabla.filas.slice(0, 15);
  const rowHeights = measureTablaFilas(doc, tabla, width);
  doc.font("Helvetica").fontSize(9.5).fillColor("#33425b");
  filas.forEach((fila, idx) => {
    fila.forEach((val, i) => {
      doc.text(String(val ?? "—"), startX + i * colWidth, y, { width: colWidth - 8, align: i === 0 ? "left" : "right" });
    });
    y += rowHeights[idx];
  });

  doc.x = startX;
  doc.y = y;
}

function drawSection(doc, s, width) {
  const required = measureSection(doc, s, width);
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (required > remaining) doc.addPage();

  const startY = doc.y;
  const leftX = MARGIN;
  doc.x = leftX + 14;

  doc.fillColor("#132a46").font("Helvetica-Bold").fontSize(13).text(s.titulo || "", { width: width - 14 });
  if (s.destacado) {
    doc.moveDown(0.15);
    doc.fillColor(ACCENT_HEX).font("Helvetica-Bold").fontSize(18).text(s.destacado, { width: width - 14 });
  }
  doc.moveDown(0.25);
  doc.fillColor("#33425b").font("Helvetica").fontSize(10.5).text(contentPlain(s.contenido), { width: width - 14 });

  if (s.grafico?.datos?.length) {
    doc.moveDown(0.3);
    doc.x = leftX + 14;
    drawGrafico(doc, s.grafico, width - 14);
  }

  if (s.tabla?.filas?.length) {
    doc.moveDown(0.3);
    doc.x = leftX + 14;
    drawTabla(doc, s.tabla, width - 14);
  }

  const endY = doc.y;
  // Barra de acento a la izquierda de toda la sección (igual que el borde
  // azul de cada bloque en el correo HTML original).
  doc.save();
  doc.rect(leftX, startY, 3, Math.max(endY - startY, 16)).fill(ACCENT_HEX);
  doc.restore();

  doc.x = leftX;
  doc.moveDown(1.1);
}

// Cuadrícula de tarjetas KPI (2 columnas) — SOLO para el informe tipo
// "Dashboard" (dashboardLayout=true, ver generateReportPdfBuffer). Un informe
// normal (tipo "bloques") nunca pasa por aquí: sus KPI siguen dibujándose
// igual que siempre, uno debajo del otro, con drawSection — este cambio de
// diseño no les afecta en nada.
const KPI_CARD_H = 58;
const KPI_GAP = 12;

function measureKpiGrid(count, cols) {
  return Math.ceil(count / cols) * (KPI_CARD_H + KPI_GAP);
}

function drawKpiGrid(doc, kpis, width) {
  const cols = 2;
  const gap = KPI_GAP;
  const cardW = (width - gap * (cols - 1)) / cols;
  let col = 0;
  let rowY = doc.y;
  for (const s of kpis) {
    const x = MARGIN + col * (cardW + gap);
    doc.roundedRect(x, rowY, cardW, KPI_CARD_H, 8).fillAndStroke("#f3f7fc", "#dbe6f2");
    doc.fillColor("#5a6b85").font("Helvetica-Bold").fontSize(8.5)
      .text((s.titulo || "").toUpperCase(), x + 12, rowY + 10, { width: cardW - 24 });
    doc.fillColor(ACCENT_HEX).font("Helvetica-Bold").fontSize(16)
      .text(s.destacado || "—", x + 12, rowY + 26, { width: cardW - 24, ellipsis: true });
    col++;
    if (col >= cols) { col = 0; rowY += KPI_CARD_H + gap; }
  }
  doc.x = MARGIN;
  doc.y = col === 0 ? rowY : rowY + KPI_CARD_H + gap;
}

// Genera el PDF del informe (secciones + gráficas) como Buffer, para
// adjuntarlo al envío — ver
// lib/mailer.js#sendReportEmail. Usa pdfkit (sin dependencias nativas ni
// Chromium) y controla manualmente los saltos de página por sección
// (measureSection) para que una gráfica nunca quede cortada entre dos páginas.
// "dashboardLayout": true solo para informes tipo "Dashboard" — agrupa los
// bloques KPI en una cuadrícula en vez de la lista vertical de siempre; el
// resto de secciones (gráfico/tabla/texto/ia) se dibuja exactamente igual,
// con el mismo drawSection que usan los informes normales.
export function generateReportPdfBuffer(content, { nombre, dashboardLayout } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const width = doc.page.width - MARGIN * 2;
      const fecha = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
      const asunto = content?.asunto || nombre || "Informe ejecutivo";

      // Alto del encabezado dinámico: un asunto largo puede ocupar 2 líneas,
      // y si el banda de color tuviera una altura fija la fecha terminaba
      // superpuesta con la segunda línea del título.
      doc.font("Helvetica-Bold").fontSize(17);
      const tituloH = doc.heightOfString(asunto, { width });
      const tituloY = 38;
      const fechaY = tituloY + tituloH + 8;
      const headerH = fechaY + 20;

      doc.rect(0, 0, doc.page.width, headerH).fill(ACCENT_HEX);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9)
        .text("SINCO · PANEL DE COMPRAS", MARGIN, 24, { characterSpacing: 1 });
      doc.fontSize(17).text(asunto, MARGIN, tituloY, { width });
      doc.font("Helvetica").fontSize(9).fillColor("#eaf2fb").text(fecha, MARGIN, fechaY);

      doc.y = headerH + 22;
      doc.x = MARGIN;
      doc.fillColor("#132a46").font("Helvetica").fontSize(11.5).text(content?.saludo || "Buen día,", { width });
      doc.moveDown(0.8);

      const secciones = content?.secciones || [];
      if (dashboardLayout) {
        const kpis = secciones.filter((s) => s._origen === "kpi");
        const resto = secciones.filter((s) => s._origen !== "kpi");
        if (kpis.length) {
          const required = measureKpiGrid(kpis.length, 2);
          if (required > doc.page.height - doc.page.margins.bottom - doc.y) doc.addPage();
          drawKpiGrid(doc, kpis, width);
          doc.moveDown(1.1);
        }
        for (const s of resto) drawSection(doc, s, width);
      } else {
        for (const s of secciones) drawSection(doc, s, width);
      }

      doc.moveDown(0.4);
      doc.fillColor("#5a6b85").font("Helvetica-Oblique").fontSize(10).text(content?.cierre || "", { width });

      doc.moveDown(1.5);
      doc.fillColor("#8795ab").font("Helvetica").fontSize(8)
        .text("Generado automáticamente por el Panel de Compras de Sinco.", { width });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
