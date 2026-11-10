import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateStructuredJson } from "@/lib/aiStructured";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

// ~6MB en base64 (~4.5MB de imagen real) — generoso para una foto/captura de
// factura, pero evita que alguien mande un archivo enorme al endpoint de IA.
const MAX_BASE64_LENGTH = 6 * 1024 * 1024;

const SYSTEM_INSTRUCTION = `Eres un lector de facturas para el formulario de Registros de compra del Panel de Compras y Bienestar de Sinco. Te dan la imagen de una factura o recibo (puede venir en español o inglés, de cualquier proveedor). Tu trabajo es decidir si la imagen realmente es una factura/recibo de compra y, si lo es, extraer los datos que coinciden con los campos de ese formulario.

Reglas:
- "esFactura": false si la imagen no es una factura, recibo o documento de cobro reconocible (ej. es una foto random, un documento de otro tipo, o está ilegible) — en ese caso deja todos los demás campos en null y no inventes nada.
- "fechaSolicitud": la fecha de EMISIÓN de la factura, formato YYYY-MM-DD. Si el año no es claro, usa tu mejor lectura del documento, nunca la fecha de hoy.
- "fe": el número o referencia de la factura (ej. el consecutivo de "Factura electrónica de venta No. ...", o el número de referencia de pago). Solo el número/código, sin el texto alrededor.
- "proveedor": el nombre de la empresa o persona que EMITE la factura (quien vende/cobra), no quien la recibe.
- "descripcion": un resumen breve y natural (no en mayúsculas sostenidas, máximo ~2 líneas) de los productos o servicios facturados — basado en los ítems de la factura, no inventado.
- "moneda": "USD" si la factura está en dólares, "COP" si está en pesos colombianos (asume COP si no hay ninguna señal de otra moneda).
- Si "moneda" es "COP": "valorConIva" es el total a pagar (con impuestos incluidos) y "valorSinIva" es el subtotal antes de impuestos, si la factura lo discrimina por separado (si no, deja "valorSinIva" en null). Deja "valorUsd" y "trm" en null.
- Si "moneda" es "USD": "valorUsd" es el total a pagar en dólares. Si la factura también muestra una tasa de cambio (TRM) a pesos, ponla en "trm" y calcula "valorConIva" multiplicando el total en USD por esa TRM (redondeado a un número entero de pesos); si no hay TRM en la factura, deja "trm" y "valorConIva" en null. Deja "valorSinIva" en null.
- Todos los montos son números planos (sin símbolo de moneda, sin separador de miles).
- Nunca inventes un dato que no puedas leer con razonable certeza en la imagen — es preferible dejar un campo en null a adivinar.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    esFactura: { type: "BOOLEAN" },
    fechaSolicitud: { type: "STRING", nullable: true },
    fe: { type: "STRING", nullable: true },
    proveedor: { type: "STRING", nullable: true },
    descripcion: { type: "STRING", nullable: true },
    moneda: { type: "STRING", nullable: true },
    valorConIva: { type: "NUMBER", nullable: true },
    valorSinIva: { type: "NUMBER", nullable: true },
    valorUsd: { type: "NUMBER", nullable: true },
    trm: { type: "NUMBER", nullable: true },
  },
  required: ["esFactura"],
};

// Nombre legible por campo, para que el frontend pueda mostrar "Se propuso:
// Proveedor, Valor + IVA, ..." igual que antes (ver InvoiceScanner.jsx).
const FIELD_LABELS = {
  fechaSolicitud: "Fecha de solicitud",
  fe: "FE / referencia",
  proveedor: "Proveedor",
  descripcion: "Descripción",
  moneda: "Moneda",
  valorConIva: "Valor + IVA",
  valorSinIva: "Valor antes de IVA",
  valorUsd: "Valor total en USD",
  trm: "TRM",
};

/**
 * @openapi
 * /api/agent/invoice-extract:
 *   post:
 *     tags: [Agente IA]
 *     summary: Lee una factura/recibo (imagen) con Nova (visión de Anthropic) y propone los campos del formulario de Registros — nunca guarda nada, el usuario revisa y decide. Requiere permiso de crear o editar registros.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageBase64, mimeType]
 *             properties:
 *               imageBase64: { type: string, description: "Imagen codificada en base64 (sin el prefijo data:...;base64,)." }
 *               mimeType: { type: string, example: "image/jpeg" }
 *     responses:
 *       200:
 *         description: Resultado de la lectura.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 esFactura: { type: boolean }
 *                 fields: { type: object, description: "Mismo shape que los campos del formulario de Registros." }
 *                 foundLabels: { type: array, items: { type: string } }
 *       400:
 *         description: Falta la imagen o es demasiado grande.
 *       403:
 *         description: No autorizado.
 */
export async function POST(request) {
  const user = await getSessionUser();
  const allowed = user && ((await isRoleAllowed(user.role, "createRecord")) || (await isRoleAllowed(user.role, "editRecord")));
  if (!allowed) return jsonError("No autorizado.", 403);

  const body = await request.json().catch(() => ({}));
  const { imageBase64, mimeType } = body;
  if (!imageBase64 || !mimeType) return jsonError("Falta la imagen de la factura.", 400);
  if (imageBase64.length > MAX_BASE64_LENGTH) return jsonError("La imagen es demasiado grande — intenta con una foto o captura más liviana.", 400);

  try {
    const result = await generateStructuredJson({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt: "Lee esta factura y devuelve el JSON con los campos del formulario.",
      schema: SCHEMA,
      image: { base64: imageBase64, mediaType: mimeType },
      budgetMs: 45000,
    });

    if (!result.esFactura) {
      return NextResponse.json({ esFactura: false, fields: {}, foundLabels: [] });
    }

    const fields = {};
    const foundLabels = [];
    for (const key of Object.keys(FIELD_LABELS)) {
      const value = result[key];
      if (value === null || value === undefined || value === "") continue;
      fields[key] = typeof value === "number" ? String(value) : value;
      foundLabels.push(FIELD_LABELS[key]);
    }

    return NextResponse.json({ esFactura: true, fields, foundLabels });
  } catch (err) {
    return jsonError(err.message || "No se pudo leer la factura.", 500);
  }
}
