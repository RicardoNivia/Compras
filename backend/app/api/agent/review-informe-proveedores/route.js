import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { generateStructuredJson } from "@/lib/aiStructured";
import { informeMensual } from "@/lib/proveedoresInforme";

// "Explicar con Nova" del Informe mensual de proveedores — mismo patrón no streaming que
// agent/review-proveedores, pero enfocado en el MES consultado: la IA recibe las cifras del
// informe ya calculadas (no recalcula nada) y devuelve resumen, alertas, notificaciones y sugerencias.
const SCHEMA = {
  type: "OBJECT",
  properties: {
    resumen: { type: "STRING" },
    alertas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { nivel: { type: "STRING" }, texto: { type: "STRING" } },
        required: ["nivel", "texto"],
      },
    },
    notificaciones: { type: "ARRAY", items: { type: "STRING" } },
    sugerencias: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["resumen", "alertas", "notificaciones", "sugerencias"],
};

const MAX_DETALLE = 40;

/**
 * @openapi
 * /api/agent/review-informe-proveedores:
 *   post:
 *     tags: [Agente IA]
 *     summary: Análisis con IA del Informe mensual de proveedores del mes indicado (requiere permiso "viewProveedores").
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               anio: { type: integer }
 *               mes: { type: integer, description: "1 a 12" }
 *     responses:
 *       200: { description: "{ resumen, alertas: [{ nivel, texto }], notificaciones, sugerencias }" }
 */
export async function POST(request) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const d = await informeMensual({ anio: body.anio ?? undefined, mes: body.mes ?? undefined });

    const resumirFila = (r) => ({ nombre: r.nombre, nit: r.nit, fecha: r.fecha, estado: r.estado, criticidad: r.criticidad, area: r.area || "Sin área" });
    const datos = {
      mes: d.titulo,
      kpis: {
        proveedoresNuevosDelMes: d.kpis.nuevos,
        proveedoresActualizadosDelMes: d.kpis.actualizados,
        cambiosHechosEnLaApp: d.kpis.cambios,
        estadosCambiadosAActualizado: d.kpis.pasadosAprobado,
      },
      estadoDeLosNuevos: d.estadoNuevos,
      estadoDeLosActualizados: d.estadoActualizados,
      tendenciaUltimosMeses: d.tendencia,
      porArea: d.areas,
      situacionGeneral: d.situacion,
      gestion: d.gestion,
      nuevos: d.nuevos.slice(0, MAX_DETALLE).map(resumirFila),
      actualizados: d.actualizados.slice(0, MAX_DETALLE).map(resumirFila),
      excepciones: (d.excepciones || []).slice(0, MAX_DETALLE).map(resumirFila),
      cambiosDelMes: d.historial.slice(0, MAX_DETALLE).map((h) => ({ fecha: h.fecha, usuario: h.usuario, tipo: h.tipo, detalle: h.detalle })),
      nota: "Las listas de detalle pueden venir recortadas; los KPIs y conteos son sobre el total.",
    };

    const systemInstruction = `Eres un analista de compras del Panel de Compras y Bienestar de Sinco. Te dan el Informe mensual de proveedores de ${d.titulo}, con las cifras ya calculadas por el sistema (no las recalcules, básate solo en ellas): proveedores nuevos y actualizados del mes con su estado, tendencia de los últimos meses, distribución por área, situación general (activos, pendientes, inactivos, excepciones que radican facturas) y los cambios hechos en la app durante el mes. Contexto: los proveedores de Actualización deben actualizarse una vez por ciclo anual (corte 31 de marzo por defecto) y pasan a Actualizado solo con el checklist completo; las Excepciones no requieren actualización; el ciclo se calcula con la fecha de última actualización.

Devuelve:
- "resumen": 2-4 frases que expliquen qué pasó en el mes (cuántos nuevos y actualizados, comparación con la tendencia, situación general).
- "alertas": 2-5 alertas, cada una con "nivel" ("critica", "advertencia" o "informativa") y "texto" concreto (por ejemplo nuevos sin aprobar, caída frente a meses anteriores, áreas concentradas, muchos pendientes).
- "notificaciones": 2-4 avisos breves y accionables para el equipo.
- "sugerencias": 3-5 recomendaciones concretas priorizadas para el próximo mes.

Cita proveedores por nombre cuando sea útil. Nunca inventes cifras, proveedores ni áreas que no estén en los datos; si algo viene en cero o vacío, dilo explícitamente (por ejemplo "no hubo proveedores nuevos en el mes"). Responde en español, claro y breve.`;

    const result = await generateStructuredJson({ systemInstruction, prompt: JSON.stringify(datos), schema: SCHEMA, budgetMs: 25000 });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
