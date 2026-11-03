import { prisma } from "@/lib/prisma";
import { logObservacionActividad } from "@/lib/audit";
import { clasificarEnSegundoPlano } from "@/lib/sentimientoComentarios";

// Encuesta y observaciones de una actividad: reúne en una sola lista lo que el equipo anota (ObservacionActividad) con
// lo que ya estaba en otras partes: la calificación y el comentario de cada participante, las observaciones del
// formulario de la actividad y el comentario de cierre. Solo las notas del equipo se crean y se borran aquí.

const MAX_TEXTO = 2000;

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function actividadOError(id) {
  const a = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) } });
  if (!a) throw badRequest("Actividad no encontrada.", 404);
  return a;
}

// Una actividad cerrada ya no se modifica en nada.
async function actividadEditable(id) {
  const a = await actividadOError(id);
  if (a.estado === "cerrada") throw badRequest("La actividad está cerrada: ya no se puede modificar.", 409);
  return a;
}

const toClientNota = (n) => ({ clave: `equipo-${n.id}`, id: n.id, tipo: "equipo", quien: n.creadoPorNombre || "—", area: null, calificacion: null, texto: n.texto, sentimiento: n.sentimiento, fecha: n.createdAt });

export async function listObservaciones(actividadId) {
  const a = await actividadOError(actividadId);
  const [notas, participantes] = await Promise.all([
    prisma.observacionActividad.findMany({ where: { actividadId: a.id }, orderBy: { createdAt: "desc" } }),
    a.aplicaParticipantes
      ? prisma.participanteActividad.findMany({
        where: { actividadId: a.id, OR: [{ calificacion: { not: null } }, { observacion: { not: null } }] },
        select: { id: true, nombre: true, area: true, calificacion: true, observacion: true, sentimiento: true },
        orderBy: { nombre: "asc" },
      })
      : [],
  ]);
  const deParticipantes = participantes.map((p) => ({ clave: `participante-${p.id}`, id: p.id, tipo: "participante", quien: p.nombre, area: p.area, calificacion: p.calificacion, texto: p.observacion, sentimiento: p.observacion ? p.sentimiento : null, fecha: null }));
  const observaciones = [
    ...notas.map(toClientNota),
    ...(a.comentarioCierre ? [{ clave: "cierre", id: null, tipo: "cierre", quien: a.cerradaPorNombre || "—", area: null, calificacion: a.calificacion, texto: a.comentarioCierre, sentimiento: a.sentimientoCierre, fecha: a.cerradaAt }] : []),
    ...(a.observaciones ? [{ clave: "actividad", id: null, tipo: "actividad", quien: "—", area: null, calificacion: null, texto: a.observaciones, sentimiento: a.sentimientoObservaciones, fecha: null }] : []),
    // Primero quienes dejaron comentario: una calificación sola dice menos.
    ...deParticipantes.filter((p) => p.texto),
    ...deParticipantes.filter((p) => !p.texto),
  ];
  const calificaciones = participantes.filter((p) => p.calificacion);
  const sentimientos = { positivo: 0, neutro: 0, negativo: 0, no_aplica: 0 };
  for (const o of observaciones) if (o.texto && sentimientos[o.sentimiento] !== undefined) sentimientos[o.sentimiento]++;
  return {
    observaciones,
    resumen: {
      calificaciones: calificaciones.length,
      promedio: calificaciones.length ? calificaciones.reduce((s, p) => s + p.calificacion, 0) / calificaciones.length : null,
      distribucion: [5, 4, 3, 2, 1].map((estrellas) => ({ estrellas, n: calificaciones.filter((p) => p.calificacion === estrellas).length })),
      comentarios: deParticipantes.filter((p) => p.texto).length,
      notasEquipo: notas.length,
      sentimientos,
      sinClasificar: observaciones.filter((o) => o.texto && !o.sentimiento).length,
    },
  };
}

export async function crearObservacion(actividadId, body, actor) {
  const a = await actividadEditable(actividadId);
  const texto = String(body?.texto ?? "").trim();
  if (!texto) throw badRequest("Escribe la observación.");
  if (texto.length > MAX_TEXTO) throw badRequest(`La observación puede tener hasta ${MAX_TEXTO} caracteres.`);
  const row = await prisma.observacionActividad.create({
    data: { actividadId: a.id, texto, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
  });
  logObservacionActividad(actor, a, "crear", `Agregó: ${texto.slice(0, 200)}`).catch(() => {});
  clasificarEnSegundoPlano(a.id);
  return toClientNota(row);
}

export async function eliminarObservacion(actividadId, id, actor) {
  const a = await actividadEditable(actividadId);
  const row = await prisma.observacionActividad.findFirst({ where: { id: Number(id), actividadId: a.id } });
  if (!row) throw badRequest("Observación no encontrada.", 404);
  await prisma.observacionActividad.delete({ where: { id: row.id } });
  logObservacionActividad(actor, a, "eliminar", `Quitó la observación de ${row.creadoPorNombre || "—"}: ${row.texto.slice(0, 200)}`).catch(() => {});
}
