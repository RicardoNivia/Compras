import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { generateGeminiJson } from "@/lib/gemini";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";

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
  },
  required: ["onlyIncumplimiento"],
};

// Siempre usa el modelo gratis de Gemini por defecto — esta es una utilidad
// puntual (traducir texto a filtros), no el chat completo del Agente IA, así
// que no expone selector de modelo ni permite modelos de pago.
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

Valores válidos de "area": ${listOrNone(options.areas)}
Valores válidos de "estado": ${listOrNone(options.estados)}
Valores válidos de "medioPago": ${listOrNone(options.medios)}
Valores válidos de "licitacion": ${listOrNone(options.licitaciones)}
Valores válidos de "estadoLegalizacion": ${listOrNone(options.estadosLegalizacion)}`;

  try {
    const filters = await generateGeminiJson({
      model: DEFAULT_GEMINI_MODEL,
      systemInstruction,
      prompt: query,
      schema: FILTER_SCHEMA,
    });
    return NextResponse.json({ filters });
  } catch (err) {
    return jsonError(err.message || "No se pudo interpretar la búsqueda.", 500);
  }
}
