import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { generateStructuredJson } from "@/lib/aiStructured";
import { indicadoresCiclo, alertasPorProveedor, listMaestroProveedores } from "@/lib/proveedoresCiclo";
import { prisma } from "@/lib/prisma";

// "Explicar con Nova" del dashboard de proveedores — mismo patrón no streaming que
// agent/review-alertas: la IA recibe las cifras YA calculadas del ciclo (no recalcula nada) y
// devuelve un análisis con alertas y notificaciones accionables.
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

/**
 * @openapi
 * /api/agent/review-proveedores:
 *   post:
 *     tags: [Agente IA]
 *     summary: Análisis con IA del ciclo de actualización de proveedores — resumen, alertas, notificaciones y sugerencias (requiere permiso "viewProveedores").
 *     responses:
 *       200: { description: "{ resumen, alertas: [{ nivel, texto }], notificaciones, sugerencias }" }
 */
export async function POST() {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    const [ind, alertas, maestro, logs] = await Promise.all([
      indicadoresCiclo(),
      alertasPorProveedor(),
      listMaestroProveedores({}),
      prisma.auditLog.findMany({ where: { entityType: { in: ["proveedor", "cicloProveedor"] } }, orderBy: { createdAt: "desc" }, take: 25 }),
    ]);

    // Contexto completo, compacto: cada proveedor del ciclo con su estado, criticidad, área y lo que le falta.
    const contar = (lista, clave) => {
      const o = {};
      for (const r of lista) o[clave(r) || "Sin dato"] = (o[clave(r) || "Sin dato"] || 0) + 1;
      return o;
    };
    const proveedoresDelCiclo = maestro.rows
      .filter((r) => r.clasificacion === "actualizacion" || r.clasificacion === "nuevo")
      .map((r) => ({
        nombre: r.nombre,
        nit: r.nit,
        tipo: r.clasificacionLabel,
        estado: r.ciclo?.estadoLabel,
        criticidad: r.criticidad || "Sin definir",
        area: r.area || "Sin área",
        checklist: `${r.checklist.completos}/${r.checklist.total}`,
        faltan: r.checklist.faltan,
        alerta: r.alerta.titulo,
      }));
    const excepciones = maestro.rows.filter((r) => r.clasificacion === "excepcion");
    const inactivos = maestro.rows.filter((r) => r.clasificacion === "inactivo");
    const porRegistrar = maestro.rows.filter((r) => r.clasificacion === "por_registrar");
    const porNivel = {};
    for (const a of Object.values(alertas)) porNivel[a.nivel] = (porNivel[a.nivel] || 0) + 1;

    const datos = {
      cicloAnio: ind.anio,
      diasParaElCorte: ind.diasParaCorte,
      totalProveedores: ind.total,
      proveedoresEnElCiclo: ind.enCiclo,
      porcentajeActualizado: ind.pctActualizado,
      clasificacion: ind.clasificacion,
      estadosDelCiclo: ind.estados,
      criticidadDeLosActivos: ind.criticidad,
      checklistIncompleto: ind.checklistIncompleto,
      criticos: ind.criticos,
      criticosPendientes: ind.atencion,
      avancePorArea: ind.areas,
      actualizadosPorMes: ind.porMes.map((m) => ({ mes: m.label, actualizados: m.value })),
      comprasConProveedorEnAlerta: ind.comprasConAlerta,
      alertasPorNivel: porNivel,
      proveedoresDelCiclo,
      excepciones: { total: excepciones.length, porMotivo: contar(excepciones, (r) => r.motivoExcepcion), radicandoFacturas: excepciones.filter((r) => r.radicaFacturas).length },
      inactivos: { total: inactivos.length, porMotivo: contar(inactivos, (r) => r.inactivoMotivo) },
      porRegistrar: { total: porRegistrar.length, ejemplos: porRegistrar.slice(0, 8).map((r) => r.nombre) },
      cambiosRecientesEnLaApp: logs.map((l) => ({ fecha: l.createdAt.toISOString().slice(0, 10), usuario: l.userNombre || "Sistema", detalle: l.recordInfo })),
      cicloSiguiente: { anio: ind.proximoCiclo.anio, proveedoresQueQuedaranDesactualizados: ind.proximoCiclo.desactualizados },
    };

    const systemInstruction = `Eres un analista de compras del Panel de Compras y Bienestar de Sinco. Te dan las cifras del ciclo anual de actualización de proveedores, ya calculadas por el sistema (no las recalcules, básate solo en ellas). Incluyen el detalle de cada proveedor del ciclo (estado, criticidad, área, checklist y qué le falta), los motivos de excepción e inactivos, y los cambios recientes hechos en la app: cítalos por nombre cuando sea útil. Reglas del ciclo: los proveedores de Actualización deben actualizarse cada año; el día siguiente a la fecha de corte (31 de marzo por defecto) todos quedan Desactualizados; un proveedor pasa a Actualizado solo con el checklist completo (6 requisitos). Los Nuevos entran actualizados. Las Excepciones no requieren actualización. "Por registrar" son proveedores con NIT provisional. En Compras, un proveedor desactualizado o con checklist incompleto genera una alerta informativa (nunca bloquea).

Devuelve:
- "resumen": 2-4 frases con el panorama (avance del ciclo, cuántos faltan, días para el corte).
- "alertas": 2-5 alertas, cada una con "nivel" ("critica", "advertencia" o "informativa") y "texto" concreto (por ejemplo críticos sin actualizar, áreas con bajo avance, compras hechas con proveedores en alerta, checklist incompleto).
- "notificaciones": 2-4 avisos breves y accionables para enviar o recordar al equipo (por ejemplo "Faltan N días para el corte: quedan X proveedores desactualizados").
- "sugerencias": 3-5 recomendaciones concretas priorizadas.

Nunca inventes cifras, proveedores ni áreas que no estén en los datos; si algo viene en cero o vacío, dilo explícitamente. Responde en español, claro y breve.`;

    const result = await generateStructuredJson({ systemInstruction, prompt: JSON.stringify(datos), schema: SCHEMA, budgetMs: 25000 });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
