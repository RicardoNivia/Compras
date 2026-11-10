import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { generateStructuredJson } from "@/lib/aiStructured";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

// Esquema forzado de la respuesta — mismo shape que el estado de filtros de
// RegistrosView.jsx, para que el frontend solo tenga que aplicarlo a sus
// setState existentes (un solo motor de filtrado, el mismo de siempre).
const FILTER_SCHEMA = {
  type: "OBJECT",
  properties: {
    search: { type: "STRING", nullable: true },
    area: { type: "STRING", nullable: true },
    estado: { type: "STRING", nullable: true },
    medioPago: { type: "STRING", nullable: true },
    licitacion: { type: "STRING", nullable: true },
    estadoLegalizacion: { type: "STRING", nullable: true },
    dateFrom: { type: "STRING", nullable: true },
    dateTo: { type: "STRING", nullable: true },
    valorMin: { type: "NUMBER", nullable: true },
    valorMax: { type: "NUMBER", nullable: true },
    onlyIncumplimiento: { type: "BOOLEAN" },
    radicado: { type: "STRING", nullable: true },
    valoracion: { type: "STRING", nullable: true },
    puntajeCompraMax: { type: "NUMBER", nullable: true },
    puntajeProveedorMax: { type: "NUMBER", nullable: true },
  },
  required: ["onlyIncumplimiento"],
};

// Usa Anthropic (ver lib/aiStructured.js) — esta es una utilidad puntual
// (traducir texto a filtros), no el chat completo del Agente IA, así que no
// expone selector de modelo.
/**
 * @openapi
 * /api/agent/search-filters:
 *   post:
 *     tags: [Agente IA]
 *     summary: Traduce una búsqueda en lenguaje natural a los filtros exactos de la tabla de Registros — utilidad puntual, no el chat completo del Agente IA (no expone selector de modelo). Llamada síncrona (no usa el patrón de trabajo en segundo plano).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query: { type: string }
 *               options:
 *                 type: object
 *                 description: "Valores válidos actuales de cada lista maestra, para que la IA no invente uno."
 *                 properties:
 *                   areas: { type: array, items: { type: string } }
 *                   estados: { type: array, items: { type: string } }
 *                   medios: { type: array, items: { type: string } }
 *                   licitaciones: { type: array, items: { type: string } }
 *                   estadosLegalizacion: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Filtros interpretados.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 filters:
 *                   type: object
 *                   properties:
 *                     search: { type: string, nullable: true }
 *                     area: { type: string, nullable: true }
 *                     estado: { type: string, nullable: true }
 *                     medioPago: { type: string, nullable: true }
 *                     licitacion: { type: string, nullable: true }
 *                     estadoLegalizacion: { type: string, nullable: true }
 *                     dateFrom: { type: string, nullable: true, format: date }
 *                     dateTo: { type: string, nullable: true, format: date }
 *                     valorMin: { type: number, nullable: true }
 *                     valorMax: { type: number, nullable: true }
 *                     onlyIncumplimiento: { type: boolean }
 *       400:
 *         description: Falta qué buscar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) return jsonError("No autorizado.", 401);

  const body = await request.json().catch(() => ({}));
  const query = (body.query || "").toString().trim();
  if (!query) return jsonError("Escribe qué quieres buscar.", 400);

  const options = body.options || {};
  const today = new Date().toISOString().slice(0, 10);

  const listOrNone = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "(sin datos)");

  const systemInstruction = `Traduces una búsqueda en lenguaje natural sobre compras a un objeto JSON de filtros EXACTOS para la tabla de Registros de compras de Sinco. Responde solo con los datos del esquema, sin inventar campos.

Reglas:
- "area", "estado", "medioPago", "licitacion", "estadoLegalizacion": deben ser EXACTAMENTE uno de los valores de las listas de abajo (respeta mayúsculas y acentos tal cual), o null si no lo mencionan o no hay una coincidencia clara. Nunca inventes un valor que no esté en la lista.
- "dateFrom"/"dateTo": formato YYYY-MM-DD. Si mencionan un mes sin año, usa el año actual. Hoy es ${today}. Si mencionan solo un año, usa desde el 1 de enero hasta el 31 de diciembre de ese año.
- "valorMin"/"valorMax": montos en pesos colombianos como número plano (sin puntos, comas ni símbolo de moneda). "más de X" → valorMin=X. "menos de X" → valorMax=X. Si dicen "X millones", multiplica por 1.000.000.
- "search": solo texto libre que no encaje en ningún otro filtro (p. ej. nombre de proveedor o palabras de la descripción), o null si todo ya quedó cubierto por los demás campos.
- "onlyIncumplimiento": true SOLO si piden explícitamente solicitudes atrasadas, incumplidas, o con más de 8 días hábiles.
- "radicado": "si" si piden compras radicadas (ya radicadas, con radicado); "no" si piden las que NO están radicadas / sin radicar / pendientes de radicar; null si no lo mencionan.
- "valoracion": la valoración de Nova es el puntaje de 1 a 5 que Nova da a la compra y al proveedor cuando se radica. "con" si piden las que YA tienen valoración / fueron valoradas / calificadas por Nova; "sin" si piden las que NO han sido valoradas / sin valorar / sin calificar por Nova; null si no la mencionan. Ejemplo: "radicados que no han sido valorados por Nova" → radicado="si", valoracion="sin".
- "puntajeCompraMax": número de 1 a 5 si piden compras con calificación/puntaje de la compra baja o "menor o igual a N" (ej. "mal valoradas" → 2; "con 3 o menos" → 3). null si no lo piden.
- "puntajeProveedorMax": igual, pero para el puntaje del PROVEEDOR (ej. "proveedores mal calificados" → 2). null si no lo piden.

Valores válidos de "area": ${listOrNone(options.areas)}
Valores válidos de "estado": ${listOrNone(options.estados)}
Valores válidos de "medioPago": ${listOrNone(options.medios)}
Valores válidos de "licitacion": ${listOrNone(options.licitaciones)}
Valores válidos de "estadoLegalizacion": ${listOrNone(options.estadosLegalizacion)}`;

  try {
    const filters = await generateStructuredJson({
      systemInstruction,
      prompt: query,
      schema: FILTER_SCHEMA,
    });
    return NextResponse.json({ filters });
  } catch (err) {
    return jsonError(err.message || "No se pudo interpretar la búsqueda.", 500);
  }
}
