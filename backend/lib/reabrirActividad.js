import { prisma } from "@/lib/prisma";
import { toClientActividad } from "@/lib/actividadesBienestar";
import { logActividadReabrir } from "@/lib/audit";

const badRequest = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Reabrir una actividad cerrada: vuelve a «ejecutada» y se puede modificar (o eliminar) normalmente. Se pide el motivo y
// queda en Auditoría con quién la reabrió, quién la había cerrado y cuándo. La calificación de cierre se conserva (al
// volver a cerrarla se pide de nuevo); las solicitudes de compra canceladas al cerrar no se reactivan.
export async function reabrirActividad(id, body, actor) {
  const motivo = String(body?.motivo || "").trim().slice(0, 500);
  if (motivo.length < 5) throw badRequest("Escribe por qué se reabre la actividad (queda en Auditoría).");
  const before = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) || 0 } });
  if (!before) throw badRequest("Actividad no encontrada.", 404);
  if (before.estado !== "cerrada") throw badRequest("La actividad no está cerrada.", 409);
  const row = await prisma.actividadBienestar.update({
    where: { id: before.id },
    data: { estado: "ejecutada", cerradaAt: null, cerradaPorUserId: null, cerradaPorNombre: null },
  });
  const cerradaPor = before.cerradaPorNombre ? ` (la había cerrado ${before.cerradaPorNombre}${before.cerradaAt ? ` el ${before.cerradaAt.toISOString().slice(0, 10)}` : ""})` : "";
  const after = toClientActividad(row);
  logActividadReabrir(actor, toClientActividad(before), after, `Reabierta: ${motivo}${cerradaPor}`).catch(() => {});
  return after;
}
