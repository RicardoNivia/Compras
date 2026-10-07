import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { listAuditLogs } from "@/lib/audit";

// Campos de "estado" que vale la pena mostrar como su propia línea en la
// línea de tiempo (ver buildTimelineEvents) — el resto de campos editados en
// la misma acción se resumen en una sola línea genérica, sin detallar qué
// cambió exactamente (ver lib/audit.js#FIELD_LABELS para la lista completa
// de campos auditables — esto es un subconjunto a propósito).
const STATE_FIELDS = ["estado", "estadoLegalizacion", "radicado"];

function formatValue(field, value) {
  if (field === "radicado") return value === true || value === "true" ? "Radicado" : "No radicado";
  return value || "(sin definir)";
}

function stateFieldLabel(field) {
  if (field === "estado") return "Estado de la compra";
  if (field === "estadoLegalizacion") return "Estado de legalización";
  if (field === "radicado") return "Radicado";
  return field;
}

// Convierte el log de auditoría (pensado para la sección Auditoría completa,
// con el diff campo por campo) en eventos de alto nivel para el usuario común:
// solo creación, cambios de estado/legalización/radicado, y un resumen
// genérico para cualquier otra edición — sin mostrar valores de campos como
// descripción, proveedor, valores, etc.
/**
 * @openapi
 * /api/records/{id}/timeline:
 *   get:
 *     tags: [Registros]
 *     summary: Línea de tiempo de alto nivel de un registro de compra (creación, cambios de estado/legalización/radicado, ediciones genéricas) — visible para cualquier rol autenticado, a diferencia de /api/audit (solo admin).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Eventos en orden cronológico (el más antiguo primero).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       kind: { type: string, enum: [creado, estado, legalizacion, radicado, editado, eliminado] }
 *                       label: { type: string }
 *                       actor: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *       401:
 *         description: No autenticado.
 */
export async function GET(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { logs } = await listAuditLogs({ recordId: params.id, pageSize: 200 });
  const events = [];

  // listAuditLogs devuelve del más reciente al más antiguo (para la pantalla
  // de Auditoría) — la línea de tiempo se lee al revés, del más antiguo arriba.
  for (const log of [...logs].reverse()) {
    const actor = log.userNombre || log.userEmail || null;
    const base = { id: log.id, actor, createdAt: log.createdAt };

    if (log.action === "crear") {
      events.push({ ...base, kind: "creado", label: "Registro creado" });
      continue;
    }
    if (log.action === "eliminar") {
      events.push({ ...base, kind: "eliminado", label: "Registro eliminado" });
      continue;
    }
    if (log.action === "radicar") {
      events.push({ ...base, kind: "radicado", label: "Marcado como radicado" });
      continue;
    }

    // "editar": separa los cambios de estado (una línea propia y específica
    // cada uno) del resto de campos (una sola línea genérica, sin detalle).
    // Varias líneas pueden salir de la MISMA fila de auditoría (ej. estado y
    // legalización cambiaron juntos) — cada una necesita un "id" distinto
    // (no solo el de la fila) para no repetir key en la lista de React.
    const changes = log.changes || [];
    let hasOtherFields = false;
    for (const c of changes) {
      if (!STATE_FIELDS.includes(c.field)) { hasOtherFields = true; continue; }
      if (c.field === "radicado") {
        events.push({ ...base, id: `${log.id}-radicado`, kind: "radicado", label: formatValue("radicado", c.after) === "Radicado" ? "Marcado como radicado" : "Radicado revertido" });
      } else {
        events.push({
          ...base,
          id: `${log.id}-${c.field}`,
          kind: c.field === "estado" ? "estado" : "legalizacion",
          label: `${stateFieldLabel(c.field)}: ${formatValue(c.field, c.after)}`,
        });
      }
    }
    if (hasOtherFields || changes.length === 0) {
      events.push({ ...base, id: `${log.id}-otros`, kind: "editado", label: "Se editaron otros datos del registro" });
    }
  }

  // Todo registro debe mostrar como mínimo cuándo se creó — los importados
  // antes de que existiera esta auditoría (o cargados directamente por
  // script, ver prisma/importar-registros.mjs) nunca tuvieron un log
  // "crear", así que la línea de tiempo se quedaría completamente vacía.
  // Si no hay un evento "creado" real, se sintetiza uno a partir de
  // "fechaRegistro" (el createdAt del propio registro) — sin autor, porque
  // no hay forma de saber quién lo cargó.
  if (!events.some((e) => e.kind === "creado")) {
    const record = await prisma.record.findUnique({ where: { id: params.id }, select: { createdAt: true } });
    if (record) {
      events.unshift({ id: `${params.id}-creado-sintetico`, actor: null, createdAt: record.createdAt, kind: "creado", label: "Registro creado" });
    }
  }

  return NextResponse.json({ events });
}
