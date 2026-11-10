import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateStructuredJson } from "@/lib/aiStructured";
import { getPendientesParaNova } from "@/lib/pendientes";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    resumen: { type: "STRING" },
    prioridades: { type: "ARRAY", items: { type: "STRING" } },
    consejo: { type: "STRING" },
  },
  required: ["resumen", "prioridades", "consejo"],
};

const ROLES_TXT = {
  admin: "administrador (ve todo: compras, proveedores y presupuesto)",
  registro: "persona de Registro (crea y sigue las solicitudes de compra)",
  legalizar: "persona de Legalización (legaliza las facturas de las compras)",
  radicar: "persona de Radicación (radica las compras ya legalizadas)",
  proveedores: "persona de Proveedores (gestiona la actualización anual de proveedores)",
};

/**
 * @openapi
 * /api/agent/review-pendientes:
 *   post:
 *     tags: [Agente IA]
 *     summary: Nova resume el día del usuario y propone por dónde empezar, con base en SUS pendientes según su rol (los mismos de "Mi día").
 *     responses:
 *       200: { description: "{ resumen, prioridades: string[], consejo }" }
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAlertas"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const datos = await getPendientesParaNova(user, 10);
  if (!datos.totales.total) {
    return NextResponse.json({ resumen: "No tienes pendientes hoy: todo está al día.", prioridades: [], consejo: "Buen momento para revisar el Dashboard o adelantar algo del próximo ciclo." });
  }

  const systemInstruction = `Eres Nova, el asistente del Panel de Compras y Bienestar de Sinco. Le hablas a ${user.nombre || "la persona"}, ${ROLES_TXT[user.role] || user.role}. Te dan SUS pendientes de hoy, ya calculados por el sistema (no recalcules nada, básate solo en ellos): secciones con su nivel (critico = urgente, atencion = conviene moverlo pronto, info = seguimiento), el total y los primeros ítems de cada una (con su referencia, qué es, días y detalle). "soloMio" indica que el registro es suyo como responsable.

Devuelve:
- "resumen": 2-3 frases, cálidas y directas, con el panorama de su día (cuántos pendientes, cuántos urgentes, qué área pesa más).
- "prioridades": entre 3 y 5 acciones concretas EN ORDEN, cada una citando referencias reales (por ejemplo "Radica las compras #454, #456 y #467: llevan más de 8 días legalizadas"). Primero lo crítico. Nunca más de una frase por acción.
- "consejo": una frase corta y útil para organizar el día.

Nunca inventes referencias, cifras ni proveedores que no estén en los datos. Si una sección viene vacía, no la menciones. Responde en español.`;

  try {
    const result = await generateStructuredJson({ systemInstruction, prompt: JSON.stringify(datos), schema: SCHEMA, budgetMs: 25000 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message || "No se pudo generar el resumen." }, { status: 500 });
  }
}
