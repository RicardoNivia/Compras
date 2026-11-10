import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { generateStructuredJson } from "@/lib/aiStructured";

// Esquema forzado de la respuesta — mismo shape que el estado de filtros de
// AuditoriaView.jsx, para que el frontend solo tenga que aplicarlo a sus
// setState existentes (un solo motor de filtrado, el mismo de siempre).
const FILTER_SCHEMA = {
  type: "OBJECT",
  properties: {
    userId: { type: "STRING", nullable: true },
    action: { type: "STRING", nullable: true },
    entityType: { type: "STRING", nullable: true },
    dateFrom: { type: "STRING", nullable: true },
    dateTo: { type: "STRING", nullable: true },
  },
  required: [],
};

const ACTIONS = ["crear", "editar", "eliminar", "radicar", "enviar", "bloqueoIa"];
const ENTITIES = ["record", "maestro", "proveedor", "user", "presupuesto", "permiso", "informe", "agente-ia"];

/**
 * @openapi
 * /api/agent/audit-search-filters:
 *   post:
 *     tags: [Agente IA]
 *     summary: Traduce una búsqueda en lenguaje natural a los filtros exactos de la tabla de Auditoría — utilidad puntual, no el chat completo del Agente IA (requiere permiso "viewAuditoria").
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
 *                 description: "Usuarios que aparecen en la auditoría, para que la IA pueda resolver un nombre al userId exacto."
 *                 properties:
 *                   actors:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         nombre: { type: string }
 *                         email: { type: string, nullable: true }
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
 *                     userId: { type: string, nullable: true }
 *                     action: { type: string, nullable: true }
 *                     entityType: { type: string, nullable: true }
 *                     dateFrom: { type: string, nullable: true, format: date }
 *                     dateTo: { type: string, nullable: true, format: date }
 *       400:
 *         description: Falta qué buscar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request) {
  const { denied } = await requirePermission("viewAuditoria");
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const query = (body.query || "").toString().trim();
  if (!query) {
    return NextResponse.json({ error: "Escribe qué quieres buscar." }, { status: 400 });
  }

  const actors = Array.isArray(body.options?.actors) ? body.options.actors : [];
  const today = new Date().toISOString().slice(0, 10);

  const actorsList = actors.length
    ? actors.map((a) => `${a.id} — ${a.nombre}${a.email ? ` (${a.email})` : ""}`).join("\n")
    : "(sin datos)";

  const systemInstruction = `Traduces una búsqueda en lenguaje natural sobre la Auditoría del Panel de Compras y Bienestar de Sinco (quién hizo qué, cuándo, sobre qué) a un objeto JSON de filtros EXACTOS. Responde solo con los datos del esquema, sin inventar campos.

Reglas:
- "userId": si mencionan a una persona por nombre, apellido o correo, busca la coincidencia más cercana en la lista de usuarios de abajo y responde EXACTAMENTE su id (el texto antes del "—"). Si no mencionan a nadie o no hay coincidencia clara, null. Nunca inventes un id.
- "action": uno de ${ACTIONS.join(", ")} (crear/editar/eliminar/radicar un registro; enviar un informe; bloqueoIa = Nova bloqueó una respuesta), según lo que describan ("qué borró", "qué eliminaciones", "qué editó" → el verbo correspondiente). null si no mencionan una acción específica.
- "entityType": uno de ${ENTITIES.join(", ")} — "record" son registros de compra, "maestro" son los catálogos (área/categoría/etc.), "proveedor" y "user" (usuarios) son sus propios catálogos, "presupuesto", "permiso" (Matriz de permisos), "informe" (Informes automáticos), "agente-ia" (bloqueos de Nova). null si no mencionan un tipo de entidad específico.
- "dateFrom"/"dateTo": formato YYYY-MM-DD. Si mencionan un mes sin año, usa el año actual. Hoy es ${today}. Si mencionan solo un año, usa desde el 1 de enero hasta el 31 de diciembre de ese año. Si mencionan "hoy", "ayer", "esta semana", "este mes", calcula el rango relativo a hoy.

Usuarios disponibles (id — nombre (correo)):
${actorsList}`;

  try {
    const filters = await generateStructuredJson({
      systemInstruction,
      prompt: query,
      schema: FILTER_SCHEMA,
    });
    return NextResponse.json({ filters });
  } catch (err) {
    return apiError(err);
  }
}
