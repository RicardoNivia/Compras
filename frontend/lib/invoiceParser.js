// Heurísticas para validar que un texto extraído por OCR corresponde a una
// factura, y para extraer de ahí los campos que coinciden con el formulario
// de registros. Nunca calcula/guarda nada por sí solo — solo propone valores
// para que el usuario los revise antes de guardar (ver InvoiceScanner.jsx).

const INVOICE_KEYWORDS = [
  /FACTURA\s+ELECTR[ÓO]NICA/i,
  /FACTURA\s+DE\s+VENTA/i,
  /\bINVOICE\b/i,
  /\bNIT\b/i,
  /\bCUFE\b/i,
  /SUBTOTAL/i,
  /\bIVA\b/i,
  /TOTAL\s+A\s+PAGAR/i,
  /AMOUNT\s+DUE/i,
  /INVOICE\s+NUMBER/i,
  /FECHA\s+FACTURA/i,
  /DATE\s+OF\s+ISSUE/i,
  /BILL\s+TO/i,
  /VENDEDOR/i,
  /FORMA\s+DE\s+PAGO/i,
  /TOTAL\s+NETO/i,
];

export function scoreInvoiceLikelihood(text) {
  if (!text) return 0;
  let score = 0;
  for (const re of INVOICE_KEYWORDS) {
    if (re.test(text)) score++;
  }
  return score;
}

export function isLikelyInvoice(text) {
  return scoreInvoiceLikelihood(text) >= 3;
}

function matchFirst(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function parseAmount(str) {
  if (!str) return null;
  let s = String(str).replace(/[^\d.,]/g, "");
  if (!s) return null;
  // Formato es-CO: 1.002.510,00 (punto miles, coma decimal)
  if (/\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // Formato en-US: 1,002,510.00 (coma miles, punto decimal)
    s = s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS_EN = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function parseDateToISO(str) {
  if (!str) return null;
  let m = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = str.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS_EN[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

// Si el texto viene casi todo en mayúsculas (como la mayoría de facturas),
// lo pasa a una redacción más natural ("Mantenimiento preventivo…" en vez de
// "MANTENIMIENTO PREVENTIVO…"), sin tocar texto que ya viene en minúsculas.
function toSentenceCase(str) {
  const letters = str.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  const lowerCount = (letters.match(/[a-záéíóúñ]/g) || []).length;
  let s = str.trim();
  if (letters.length > 0 && lowerCount / letters.length < 0.35) s = s.toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const MAX_DESCRIPCION_LEN = 300;

// Busca la tabla de ítems de la factura (entre el encabezado "Descripción"/
// "Description" y el pie "Subtotal"/"Total líneas") y arma una descripción
// legible con lo que se compró, quitando códigos de producto, cantidades,
// unidades y valores — solo queda el texto de cada ítem.
function extractLineItemsDescription(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => /DESCRIPCI[ÓO]N|DESCRIPTION/i.test(l));
  if (headerIdx === -1) return null;

  let endIdx = lines.findIndex((l, i) => i > headerIdx && /SUBTOTAL|TOTAL\s+L[ÍI]NEAS|TOTAL\s+NETO/i.test(l));
  if (endIdx === -1) endIdx = Math.min(lines.length, headerIdx + 15);
  const block = lines.slice(headerIdx + 1, endIdx);

  const rowStart = /^(\d{1,3})[\s.)-]+/;
  const codeToken = /^[A-Z]{1,5}[\-. ]?\d{1,5}[A-Z0-9\-]{0,8}$/;
  const noiseWord = /^(und\.?|unidad(es)?|qty|pcs?|cant\.?|m[eé]d\.?)$/i;

  const items = [];
  let current = "";

  for (const rawLine of block) {
    const firstToken = rawLine.split(/\s+/)[0] || "";
    const isNewRow = rowStart.test(rawLine) || codeToken.test(firstToken);
    if (isNewRow && current) {
      items.push(current);
      current = "";
    }
    const cleaned = rawLine
      .replace(rowStart, " ")
      .split(/\s+/)
      .filter((tok) => {
        if (!tok) return false;
        if (/^[\d.,%$]+$/.test(tok)) return false;
        if (codeToken.test(tok)) return false;
        if (noiseWord.test(tok)) return false;
        return true;
      })
      .join(" ")
      .trim();
    if (cleaned) current = current ? `${current} ${cleaned}` : cleaned;
  }
  if (current) items.push(current);

  const cleanedItems = items.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 4);
  if (!cleanedItems.length) return null;

  let joined = cleanedItems.map(toSentenceCase).join("; ");
  if (joined.length > MAX_DESCRIPCION_LEN) joined = `${joined.slice(0, MAX_DESCRIPCION_LEN - 1)}…`;
  return joined;
}

// Extrae del texto OCR los campos del formulario que logre reconocer.
// Devuelve { fields, foundLabels } — foundLabels es para mostrarle al
// usuario qué se llenó automáticamente y qué debe revisar/completar él mismo.
export function parseInvoiceFields(text) {
  const fe = matchFirst(text, [
    /FACTURA\s+ELECTR[ÓO]NICA\s+DE\s+VENTA\s*(?:NO\.?|N[úu]mero)?\s*[:\-]?\s*([A-Z]{0,4}[\s-]?\d[\dA-Z\-]{2,})/i,
    /INVOICE\s+NUMBER\s*[:\-]?\s*([A-Z0-9\-]+)/i,
    /FACTURA\s+NO\.?\s*[:\-]?\s*([A-Z0-9\-]+)/i,
    /REFERENCIA\s+DE\s+PAGO\s+ELECTR[ÓO]NICO\s*[:\-]?\s*(\d+)/i,
  ]);

  const fechaRaw = matchFirst(text, [
    /FECHA\s+FACTURA\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /FECHA\s+EMISI[ÓO]N\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /DATE\s+OF\s+ISSUE\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /ISSUE\s+DATE\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
  ]);

  const proveedor = matchFirst(text, [
    /RAZ[ÓO]N\s+SOCIAL\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ0-9 .,&]{3,60})/i,
    /^([A-ZÁÉÍÓÚÑ0-9 .,&]{3,60}(?:S\.?A\.?S\.?|LTDA|S\.?A\.?|INC\.?|LLC|PBC))\s*$/im,
  ]);

  const descripcion = matchFirst(text, [
    /POR\s+CONCEPTO\s+DE\s*[:\-]?\s*\n?\s*([^\n]{3,120})/i,
    /CONCEPTO\s*[:\-]\s*([^\n]{3,120})/i,
    /SERVICIO\s+PRESTADO\s+POR\s+DIVISI[ÓO]N\s*[:\-]?\s*([^\n]{3,80})/i,
    /DESCRIPTION\s*\n\s*([^\n]{3,120})/i,
  ]);

  const totalRaw = matchFirst(text, [
    /TOTAL\s+A\s+PAGAR\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
    /TOTAL\s+DE\s+LA\s+OPERACI[ÓO]N\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
    /AMOUNT\s+DUE\s*(?:\$?\s*[\d.,]+\s*USD\s+due[^$]*)?\$?\s*([\d.,]+)/i,
    /\bTOTAL\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  ]);

  const subtotalRaw = matchFirst(text, [
    /TOTAL\s+NETO\s*-?\s*SUBTOTAL\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
    /SUBTOTAL\s*[:\-]?\s*\$?\s*([\d.,]+)/i,
  ]);

  const trmRaw = matchFirst(text, [/\bTRM\b\s*[:\-]?\s*\$?\s*([\d.,]+)/i]);

  const isUSD = /\bUSD\b/i.test(text) || /\bUS\$/i.test(text);

  const fields = {};
  const foundLabels = [];

  const fechaIso = parseDateToISO(fechaRaw);
  if (fechaIso) { fields.fechaSolicitud = fechaIso; foundLabels.push("Fecha de solicitud"); }
  if (fe) { fields.fe = fe; foundLabels.push("FE / referencia"); }
  if (proveedor) { fields.proveedor = proveedor.trim(); foundLabels.push("Proveedor"); }

  const itemsDescripcion = extractLineItemsDescription(text);
  if (itemsDescripcion) {
    fields.descripcion = itemsDescripcion;
    foundLabels.push("Descripción (ítems de la factura)");
  } else if (descripcion) {
    fields.descripcion = descripcion.trim();
    foundLabels.push("Descripción");
  }

  const total = parseAmount(totalRaw);
  const subtotal = parseAmount(subtotalRaw);
  const trm = parseAmount(trmRaw);

  if (isUSD) {
    fields.moneda = "USD";
    foundLabels.push("Moneda (USD)");
    if (total != null) { fields.valorUsd = String(total); foundLabels.push("Valor total en USD"); }
    if (trm != null) {
      fields.trm = String(trm);
      foundLabels.push("TRM");
      if (total != null) {
        fields.valorConIva = String(Math.round(total * trm));
        foundLabels.push("Valor + IVA (calculado con la TRM de la factura)");
      }
    }
  } else {
    fields.moneda = "COP";
    if (total != null) { fields.valorConIva = String(total); foundLabels.push("Valor + IVA"); }
    if (subtotal != null) { fields.valorSinIva = String(subtotal); foundLabels.push("Valor antes de IVA"); }
  }

  return { fields, foundLabels };
}
