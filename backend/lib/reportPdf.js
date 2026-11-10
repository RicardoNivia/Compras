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
    const t = s.grafico.tipo;
    h += t === "dona" ? 16 + Math.max(DONA_H, Math.min(s.grafico.datos.length, 8) * 18)
      : t === "columnas" || t === "linea" || t === "apiladas" ? 16 + COL_H + 50
      : 16 + Math.min(s.grafico.datos.length, 8) * ROW_H;
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
  const esVal = String(grafico.metrica || "").startsWith("valoracion"); // valoración de Nova: escala fija de 1 a 5
  const max = esVal ? 5 : Math.max(...datos.map((d) => d.valor || 0), 1);
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
      .text(esVal ? `${Number(d.valor).toFixed(1).replace(".", ",")} / 5` : fmtNum(d.valor), barX + barW + 8, rowY + 3, { width: valueW, align: "right" });

    doc.x = startX;
    doc.y = rowY + ROW_H;
  }
}

// Dona de participación (gráficas con estilo "dona" del Estudio de informes): porciones con el color de cada área o
// estado cuando se reconoce, y la paleta de la app para el resto; leyenda con valor y porcentaje a la derecha.
const DONA_H = 150;
const PALETA_HEX = ["#2063a0", "#fb8500", "#8fc93a", "#00bcd4", "#d14343", "#a2a6ab", "#7b61ff", "#f4b400"];

function arcoDona(cx, cy, r, ri, a0, a1) {
  const p = (rad, a) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(ri, a1)} A${ri},${ri} 0 ${large} 0 ${p(ri, a0)} Z`;
}

function drawDona(doc, grafico, width) {
  const startX = doc.x;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#5a6b85")
    .text((grafico.titulo || "").toUpperCase(), { width, characterSpacing: 0.3 });
  doc.moveDown(0.3);
  const top = doc.y;
  const datos = grafico.datos.filter((d) => (d.valor || 0) > 0).slice(0, 8);
  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;
  const r = 62;
  const ri = 38;
  const cx = startX + r + 4;
  const cy = top + DONA_H / 2;
  let a = -Math.PI / 2;
  datos.forEach((d, i) => {
    const frac = d.valor / total;
    const a1 = a + frac * Math.PI * 2 - (datos.length > 1 ? 0.012 : 0.0005);
    doc.path(arcoDona(cx, cy, r, ri, a, Math.max(a + 0.001, a1))).fill(ESTADO_COLOR_HEX[d.etiqueta] || PALETA_HEX[i % PALETA_HEX.length]);
    a += frac * Math.PI * 2;
  });
  // Total en el centro
  const totalTxt = grafico.metrica === "cantidad" ? fmtNum(total) : `$${fmtNum(total)}`;
  doc.font("Helvetica-Bold").fontSize(totalTxt.length > 11 ? 8 : 10).fillColor("#132a46")
    .text(totalTxt, cx - ri, cy - 6, { width: ri * 2, align: "center" });

  const lx = startX + r * 2 + 30;
  const lw = width - (lx - startX);
  let ly = top + Math.max(0, (DONA_H - datos.length * 18) / 2);
  datos.forEach((d, i) => {
    doc.rect(lx, ly + 3, 8, 8).fill(ESTADO_COLOR_HEX[d.etiqueta] || PALETA_HEX[i % PALETA_HEX.length]);
    const pct = `${Math.round((d.valor / total) * 100)}%`;
    const val = grafico.metrica === "cantidad" ? fmtNum(d.valor) : `$${fmtNum(d.valor)}`;
    doc.font("Helvetica").fontSize(9.5).fillColor("#33425b").text(d.etiqueta, lx + 14, ly + 1, { width: lw * 0.5, height: 12, ellipsis: true });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#132a46").text(`${val}  ·  ${pct}`, lx + 14 + lw * 0.5, ly + 1, { width: lw * 0.5 - 14, align: "right" });
    ly += 18;
  });
  doc.x = startX;
  doc.y = top + Math.max(DONA_H, datos.length * 18);
}

// Columnas o línea en el tiempo (eje X = días o meses, eje Y = valor o cantidad): para gráficas agrupadas por "dia" o
// "mes", o cuando el usuario pide ese tipo. Etiquetas del eje X espaciadas para que no se encimen.
const COL_H = 130;

function fmtEje(v, metrica) {
  if (metrica === "cantidad") return fmtNum(v);
  if (v >= 1e6) return `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (v >= 1e3) return `$${(v / 1e3).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil`;
  return `$${fmtNum(v)}`;
}

function drawColumnas(doc, grafico, width) {
  const startX = doc.x;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#5a6b85")
    .text((grafico.titulo || "").toUpperCase(), { width, characterSpacing: 0.3 });
  doc.moveDown(0.3);
  const top = doc.y + 8;
  const datos = grafico.datos;
  const max = Math.max(...datos.map((d) => d.valor || 0), 1);
  const ejeW = 44;
  const x0 = startX + ejeW;
  const w = width - ejeW;
  const base = top + COL_H;
  // Líneas guía y valores del eje Y
  doc.font("Helvetica").fontSize(7.5).fillColor("#8795ab");
  for (let i = 0; i <= 4; i++) {
    const y = base - (COL_H * i) / 4;
    doc.moveTo(x0, y).lineTo(x0 + w, y).strokeColor(i === 0 ? "#c9d0da" : "#eef1f5").lineWidth(0.7).stroke();
    doc.text(fmtEje((max * i) / 4, grafico.metrica), startX, y - 4, { width: ejeW - 6, align: "right", lineBreak: false });
  }
  const paso = w / datos.length;
  const cada = Math.max(1, Math.ceil(datos.length / 12));
  if (grafico.tipo === "linea") {
    const pts = datos.map((d, i) => [x0 + paso * i + paso / 2, base - ((d.valor || 0) / max) * COL_H]);
    doc.save();
    doc.moveTo(pts[0][0], base);
    pts.forEach(([x, y]) => doc.lineTo(x, y));
    doc.lineTo(pts[pts.length - 1][0], base).closePath().fillOpacity(0.12).fill(ACCENT_HEX);
    doc.restore();
    doc.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([x, y]) => doc.lineTo(x, y));
    doc.strokeColor(ACCENT_HEX).lineWidth(1.8).stroke();
    pts.forEach(([x, y]) => doc.circle(x, y, 2.2).fill("#0a9fbd"));
  } else if (grafico.tipo === "apiladas") {
    const bw = Math.max(2, Math.min(28, paso * 0.68));
    const series = grafico.series || [];
    const colorSerie = (n, i) => (n === "Otras" ? "#a2a6ab" : PALETA_HEX[i % PALETA_HEX.length]);
    datos.forEach((d, i) => {
      const x = x0 + paso * i + (paso - bw) / 2;
      let y = base;
      (d.segmentos || []).forEach((sg, si) => {
        const h = ((sg.valor || 0) / max) * COL_H;
        if (h <= 0) return;
        doc.rect(x, y - h, bw, h).fill(colorSerie(sg.nombre, si));
        y -= h;
      });
    });
    // Leyenda de las series
    let lx = x0;
    const ly = base + 20;
    doc.font("Helvetica").fontSize(7.5);
    series.forEach((n, i) => {
      const w = doc.widthOfString(n) + 20;
      if (lx + w > x0 + w * 0 + (width - ejeW)) return;
      doc.rect(lx, ly + 1, 7, 7).fill(colorSerie(n, i));
      doc.fillColor("#33425b").text(n, lx + 10, ly, { lineBreak: false });
      lx += w;
    });
  } else {
    const bw = Math.max(2, Math.min(28, paso * 0.68));
    datos.forEach((d, i) => {
      const h = Math.max(1, ((d.valor || 0) / max) * COL_H);
      const x = x0 + paso * i + (paso - bw) / 2;
      doc.roundedRect(x, base - h, bw, h, Math.min(3, bw / 2)).fill(i % 2 ? "#2a78bf" : ACCENT_HEX);
      if (datos.length <= 14) {
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#132a46").text(fmtEje(d.valor, grafico.metrica), x - 12, base - h - 10, { width: bw + 24, align: "center", lineBreak: false });
      }
    });
  }
  // Línea punteada con el promedio
  if (grafico.promedio && datos.length > 1) {
    const prom = datos.reduce((s, d) => s + (d.valor || 0), 0) / datos.length;
    const y = base - (prom / max) * COL_H;
    doc.save();
    doc.moveTo(x0, y).lineTo(x0 + w, y).dash(4, { space: 3 }).strokeColor("#fb8500").lineWidth(1.1).stroke();
    doc.undash();
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#c46a00").text(`Promedio ${fmtEje(prom, grafico.metrica)}`, x0 + w - 110, y - 10, { width: 110, align: "right", lineBreak: false });
  }
  doc.font("Helvetica").fontSize(7).fillColor("#5a6b85");
  datos.forEach((d, i) => {
    if (i % cada !== 0) return;
    doc.text(d.etiqueta, x0 + paso * i + paso / 2 - 22, base + 5, { width: 44, align: "center", lineBreak: false });
  });
  doc.x = startX;
  doc.y = base + (grafico.tipo === "apiladas" ? 36 : 20);
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
    if (s.grafico.tipo === "dona") drawDona(doc, s.grafico, width - 14);
    else if (["columnas", "linea", "apiladas"].includes(s.grafico.tipo)) drawColumnas(doc, s.grafico, width - 14);
    else drawGrafico(doc, s.grafico, width - 14);
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

// cols: 2 en el informe tipo "Dashboard"; en el Estudio, hasta 4 por fila según cuántas cifras clave seguidas haya.
// Si la cifra trae "variacion" (frente al período anterior) se muestra debajo, en verde o rojo.
function drawKpiGrid(doc, kpis, width, cols = 2) {
  const gap = KPI_GAP;
  const cardW = (width - gap * (cols - 1)) / cols;
  const big = cols <= 2 ? 16 : 13.5;
  let col = 0;
  let rowY = doc.y;
  for (const s of kpis) {
    const x = MARGIN + col * (cardW + gap);
    doc.roundedRect(x, rowY, cardW, KPI_CARD_H, 8).fillAndStroke("#f3f7fc", "#dbe6f2");
    doc.fillColor("#5a6b85").font("Helvetica-Bold").fontSize(cols <= 2 ? 8.5 : 7.5)
      .text((s.titulo || "").toUpperCase(), x + 10, rowY + 9, { width: cardW - 20, height: 18, ellipsis: true });
    doc.fillColor(ACCENT_HEX).font("Helvetica-Bold").fontSize(big)
      .text(s.destacado || "—", x + 10, rowY + 24, { width: cardW - 20, ellipsis: true, lineBreak: false });
    if (s.variacion?.texto) {
      doc.fillColor(s.variacion.delta < 0 ? "#a32f2f" : s.variacion.delta > 0 ? "#3b6b0b" : "#5a6b85").font("Helvetica-Bold").fontSize(7.5)
        .text(s.variacion.texto, x + 10, rowY + 45, { width: cardW - 20, ellipsis: true, lineBreak: false });
    }
    col++;
    if (col >= cols) { col = 0; rowY += KPI_CARD_H + gap; }
  }
  doc.x = MARGIN;
  doc.y = col === 0 ? rowY : rowY + KPI_CARD_H + gap;
}

// Detalle de compras: tabla larga que continúa en las páginas que haga falta, con el encabezado de columnas repetido en
// cada página, filas de una línea (el texto largo se corta con "…"), franjas alternas y el total al final.
const DETALLE_ANCHOS = [0.07, 0.11, 0.31, 0.2, 0.12, 0.08, 0.11];
const DETALLE_FILA_H = 15;
function drawDetalleCompras(doc, s, width) {
  const abajo = () => doc.page.height - doc.page.margins.bottom - 6;
  const cabecera = 13 + 4 + 22 + 14 + 3 * DETALLE_FILA_H;
  if (doc.y + cabecera > abajo()) doc.addPage();
  const x0 = MARGIN;
  doc.x = x0;
  doc.fillColor("#132a46").font("Helvetica-Bold").fontSize(13).text(s.titulo || "", { width });
  if (s.destacado) doc.fillColor(ACCENT_HEX).font("Helvetica-Bold").fontSize(15).text(s.destacado, { width });
  if (s.contenido) doc.fillColor("#5a6b85").font("Helvetica").fontSize(9).text(contentPlain(s.contenido), { width });
  doc.moveDown(0.4);
  const t = s.tabla;
  if (!t?.filas?.length) { doc.moveDown(1); return; }
  const anchos = DETALLE_ANCHOS.map((p) => p * width);
  const xs = anchos.map((_, i) => x0 + anchos.slice(0, i).reduce((a, b) => a + b, 0));
  const derecha = (i) => i === t.columnas.length - 1;
  const encabezado = () => {
    const y = doc.y;
    doc.rect(x0, y, width, DETALLE_FILA_H + 2).fill("#e4ecf4");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#33425b");
    t.columnas.forEach((c, i) => doc.text(String(c).toUpperCase(), xs[i] + 4, y + 5, { width: anchos[i] - 8, align: derecha(i) ? "right" : "left", lineBreak: false, ellipsis: true }));
    doc.y = y + DETALLE_FILA_H + 2;
  };
  const fila = (valores, idx, negrita = false) => {
    if (doc.y + DETALLE_FILA_H > abajo()) { doc.addPage(); doc.y = doc.page.margins.top; encabezado(); }
    const y = doc.y;
    if (negrita) doc.rect(x0, y, width, DETALLE_FILA_H + 2).fill("#dbe6f2");
    else if (idx % 2) doc.rect(x0, y, width, DETALLE_FILA_H).fill("#f6f9fc");
    doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(7.8).fillColor(negrita ? "#132a46" : "#33425b");
    valores.forEach((v, i) => doc.text(String(v ?? ""), xs[i] + 4, y + 4, { width: anchos[i] - 8, align: derecha(i) ? "right" : "left", lineBreak: false, ellipsis: true, height: DETALLE_FILA_H }));
    doc.y = y + DETALLE_FILA_H + (negrita ? 2 : 0);
  };
  encabezado();
  t.filas.forEach((f, i) => fila(f, i));
  if (t.total) fila(t.total, 0, true);
  doc.x = x0;
  doc.moveDown(1.1);
}

// Estudio de informes: las cifras clave seguidas se agrupan en una cuadrícula en el lugar donde están (no se mueven
// al principio como en el tipo "Dashboard"); el resto de secciones se dibuja igual que siempre.
function drawSeccionesEstudio(doc, secciones, width) {
  let i = 0;
  while (i < secciones.length) {
    if (secciones[i]._origen === "kpi") {
      const run = [];
      while (i < secciones.length && secciones[i]._origen === "kpi") run.push(secciones[i++]);
      const cols = run.length <= 4 ? run.length : 3;
      const required = measureKpiGrid(run.length, cols);
      if (required > doc.page.height - doc.page.margins.bottom - doc.y) doc.addPage();
      drawKpiGrid(doc, run, width, Math.max(1, cols));
      doc.moveDown(1.1);
    } else if (secciones[i]._origen === "detalleCompras") {
      drawDetalleCompras(doc, secciones[i++], width);
    } else {
      drawSection(doc, secciones[i++], width);
    }
  }
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
// "estudio": true para los informes del Estudio de informes — encabezado con degradado y subtítulo (período · para
// quién), sin saludo de correo, cifras clave en cuadrícula donde estén y número de página en cada hoja.
export function generateReportPdfBuffer(content, { nombre, dashboardLayout, estudio, subtitulo, fecha: fechaRef } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", bufferPages: !!estudio, margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const width = doc.page.width - MARGIN * 2;
      const fecha = (fechaRef || new Date()).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
      const asunto = content?.asunto || nombre || "Informe ejecutivo";

      // Alto del encabezado dinámico: un asunto largo puede ocupar 2 líneas,
      // y si el banda de color tuviera una altura fija la fecha terminaba
      // superpuesta con la segunda línea del título.
      doc.font("Helvetica-Bold").fontSize(17);
      const tituloH = doc.heightOfString(asunto, { width });
      const tituloY = 38;
      const fechaY = tituloY + tituloH + 8;
      const headerH = fechaY + 20;

      if (estudio) {
        const grad = doc.linearGradient(0, 0, doc.page.width, headerH);
        grad.stop(0, "#123f6b").stop(0.55, ACCENT_HEX).stop(1, "#0a9fbd");
        doc.rect(0, 0, doc.page.width, headerH).fill(grad);
      } else {
        doc.rect(0, 0, doc.page.width, headerH).fill(ACCENT_HEX);
      }
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9)
        .text("SINCO · PANEL DE COMPRAS Y BIENESTAR", MARGIN, 24, { characterSpacing: 1 });
      doc.fontSize(17).text(asunto, MARGIN, tituloY, { width });
      doc.font("Helvetica").fontSize(9).fillColor("#eaf2fb").text(subtitulo ? `${subtitulo} · Generado el ${fecha}` : fecha, MARGIN, fechaY);

      doc.y = headerH + 22;
      doc.x = MARGIN;
      if (!estudio) {
        doc.fillColor("#132a46").font("Helvetica").fontSize(11.5).text(content?.saludo || "Buen día,", { width });
        doc.moveDown(0.8);
      }

      const secciones = content?.secciones || [];
      if (estudio) {
        drawSeccionesEstudio(doc, secciones, width);
      } else if (dashboardLayout) {
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
        .text("Generado automáticamente por el Panel de Compras y Bienestar de Sinco.", { width });

      if (estudio) {
        // Pie con número de página en cada hoja (sin margen inferior, para que escribir ahí no abra una página nueva).
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          const bottom = doc.page.margins.bottom;
          doc.page.margins.bottom = 0;
          const y = doc.page.height - 30;
          doc.moveTo(MARGIN, y - 8).lineTo(doc.page.width - MARGIN, y - 8).strokeColor("#e4ecf4").lineWidth(0.8).stroke();
          doc.font("Helvetica").fontSize(8).fillColor("#8795ab")
            .text("Panel de Compras y Bienestar · Sinco", MARGIN, y, { width: width / 2, lineBreak: false });
          doc.text(`Página ${i - range.start + 1} de ${range.count}`, MARGIN + width / 2, y, { width: width / 2, align: "right", lineBreak: false });
          doc.page.margins.bottom = bottom;
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
