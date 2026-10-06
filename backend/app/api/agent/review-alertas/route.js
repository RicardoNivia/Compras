import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateStructuredJson } from "@/lib/aiStructured";
import { getAlertsData } from "@/lib/alerts";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    resumen: { type: "STRING" },
    riesgos: { type: "STRING" },
    proyeccion: { type: "STRING" },
    sugerencias: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["resumen", "riesgos", "proyeccion", "sugerencias"],
};

const MAX_ITEMS = 40;

// "Revisar con IA" de la página Alertas y notificaciones — mismo patrón no
// streaming que agent/explain y agent/review-observaciones, pero sobre las
// tres listas de la página (no sobre un solo KPI/registro): da un análisis
// completo con riesgo de mayor atraso, una proyección de gasto según el
// ritmo actual, y sugerencias concretas de mejora.
/**
 * @openapi
 * /api/agent/review-alertas:
 *   post:
 *     tags: [Agente IA]
 *     summary: "\"Revisar con IA\" de la página Alertas y notificaciones: análisis completo (resumen, riesgos, proyección de gasto y sugerencias) sobre las listas ya calculadas de la página (requiere permiso \"viewAlertas\"). Sin body. Llamada síncrona (no usa el patrón de trabajo en segundo plano)."
 *     responses:
 *       200:
 *         description: Análisis generado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resumen: { type: string }
 *                 riesgos: { type: string }
 *                 proyeccion: { type: string }
 *                 sugerencias: { type: array, items: { type: string } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAlertas"))) {
    return jsonError("No autorizado.", 403);
  }

  const { solicitudesPendientes, riesgoPresupuesto, riesgoTiempos, noRadicadas } = await getAlertsData();

  const systemInstruction = `Eres un analista de compras del Panel de Compras de Sinco. Te dan cuatro listas ya calculadas por el sistema (no las recalcules, básate solo en ellas): solicitudes pendientes de entrega (con días hábiles transcurridos), áreas según % de presupuesto anual ya gastado, compras cuyo tiempo de solicitud a entrega superó el límite de 8 días hábiles (SLA), y compras ya legalizadas que todavía no se han radicado (último paso del trámite pendiente).

Devuelve:
- "resumen": 2-4 frases con el panorama general (cuántas solicitudes pendientes hay, cuántas áreas están en alerta/excedidas de presupuesto, cuántas compras incumplieron el SLA).
- "riesgos": 2-4 frases señalando qué compras o áreas tienen más riesgo de seguir atrasándose o de agravar su situación de presupuesto, citando ejemplos puntuales (proveedor, área, días, % gastado) de las listas entregadas.
- "proyeccion": 2-3 frases proyectando, según el ritmo de gasto actual de las áreas más comprometidas, si probablemente cerrarán el año sobre o dentro del presupuesto — sé explícito en que es una proyección aproximada, no una cifra exacta.
- "sugerencias": 3-5 recomendaciones concretas y accionables (ej. "revisar primero las N solicitudes de [área] con más de X días", "congelar nuevas compras de [categoría] en [área] hasta reducir el % gastado").

Nunca inventes cifras, proveedores ni áreas que no estén en los datos entregados — si una lista viene vacía, dilo explícitamente (ej. "no hay compras fuera de SLA actualmente") en vez de inventar un problema.`;

  const prompt = `Solicitudes pendientes de entrega (${solicitudesPendientes.length}, más atrasadas primero, máx. ${MAX_ITEMS} mostradas):
${JSON.stringify(solicitudesPendientes.slice(0, MAX_ITEMS))}

Riesgo de presupuesto por área (año actual, % gastado de mayor a menor):
${JSON.stringify(riesgoPresupuesto)}

Compras fuera del SLA de 8 días hábiles (${riesgoTiempos.length}, peores primero, máx. ${MAX_ITEMS} mostradas):
${JSON.stringify(riesgoTiempos.slice(0, MAX_ITEMS))}

Compras legalizadas pero aún no radicadas (${noRadicadas.length}, más antiguas primero, máx. ${MAX_ITEMS} mostradas):
${JSON.stringify(noRadicadas.slice(0, MAX_ITEMS))}`;

  try {
    const result = await generateStructuredJson({ systemInstruction, prompt, schema: REVIEW_SCHEMA, budgetMs: 25000 });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err.message || "No se pudo generar el análisis.", 500);
  }
}
