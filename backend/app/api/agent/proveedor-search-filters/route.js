import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { generateStructuredJson } from "@/lib/aiStructured";

// Mismo patrón que /api/agent/search-filters (Registros) y
// /api/agent/audit-search-filters (Auditoría): traduce lenguaje natural a
// los filtros exactos del maestro de Proveedores (GET /api/proveedores/maestro).
const FILTER_SCHEMA = {
  type: "OBJECT",
  properties: {
    q: { type: "STRING", nullable: true },
    clasificacion: { type: "STRING", nullable: true },
    estado: { type: "STRING", nullable: true },
    criticidad: { type: "STRING", nullable: true },
    area: { type: "STRING", nullable: true },
    checklist: { type: "STRING", nullable: true },
  },
  required: [],
};

/**
 * @openapi
 * /api/agent/proveedor-search-filters:
 *   post:
 *     tags: [Agente IA]
 *     summary: Traduce una búsqueda en lenguaje natural a los filtros exactos del maestro de Proveedores (requiere permiso "viewProveedores").
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
 *                 properties:
 *                   areas: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Filtros del maestro de proveedores }
 *       400: { description: La búsqueda está vacía }
 */
export async function POST(request) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const query = (body.query || "").toString().trim();
  if (!query) {
    return NextResponse.json({ error: "Escribe qué quieres buscar." }, { status: 400 });
  }

  const areas = Array.isArray(body.options?.areas) ? body.options.areas : [];

  const systemInstruction = `Traduces una búsqueda en lenguaje natural sobre el maestro de Proveedores de Sinco a un objeto JSON de filtros EXACTOS. Responde solo con los datos del esquema, sin inventar campos.

Reglas:
- "q": texto libre para buscar por nombre o NIT, solo si mencionan un proveedor específico. null si no.
- "clasificacion": "actualizacion" (proveedores que se actualizan cada año) | "nuevo" (creados este año) | "excepcion" | "inactivo". null si no mencionan clasificación.
- "estado": "desactualizado" | "en_proceso" | "en_aprobacion" | "actualizado", según el estado en el ciclo de actualización. null si no mencionan estado.
- "criticidad": "Critico" | "No crítico". null si no mencionan criticidad.
- "area": el área mencionada, debe coincidir EXACTAMENTE con una de esta lista si aplica: ${areas.join(", ") || "(sin datos)"}. null si no.
- "checklist": "completo" si piden checklist completo o al día; "incompleto" si piden checklist incompleto o faltantes. null si no mencionan checklist.`;

  try {
    const filters = await generateStructuredJson({ systemInstruction, prompt: query, schema: FILTER_SCHEMA });
    return NextResponse.json({ filters });
  } catch (err) {
    return apiError(err);
  }
}
