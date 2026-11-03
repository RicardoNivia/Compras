import { prisma } from "@/lib/prisma";
import { createRecord } from "@/lib/records";
import { logSolicitudCompra, logSolicitudCompraCreada } from "@/lib/audit";

// Solicitudes de compra: Bienestar pide una compra desde una actividad ya registrada (qué quiere y cuándo debe llegar) y quien puede crear compras la
// atiende en Alertas y notificaciones › Solicitudes de compra: "Generar compra" abre el formulario de Compras con los
// datos ya llenos y al crear la compra queda asociada a la actividad; "Rechazar" exige decir por qué, y quien la pidió lo
// ve en la pestaña Compras de la actividad. Mientras no se atienda sigue pendiente.
// Las pendientes suman en la campana de quien puede crear compras y la llevan a la pestaña Solicitudes de compra (no a la
// Bandeja). A quien la pidió le llega un aviso a su Bandeja cuando se registra la compra o la rechazan (avisarSolicitante).
// Estados: pendiente → generando (solo mientras se crea la compra) → creada | rechazada | cancelada.

const badRequest = (msg, status = 400) => Object.assign(new Error(msg), { status });
const texto = (v, max) => String(v ?? "").trim().slice(0, max) || null;

function fechaONula(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw badRequest("La fecha debe ser válida (aaaa-mm-dd).");
  return s;
}

export function toClientSolicitud(s) {
  return {
    id: s.id,
    actividadId: s.actividadId,
    actividad: s.actividad?.nombre,
    linea: s.actividad?.linea,
    fechaActividad: s.actividad?.fecha,
    descripcion: s.descripcion,
    valorEstimado: s.valorEstimado,
    categoria: s.categoria,
    categoriaId: s.categoriaId,
    proveedorSugerido: s.proveedorSugerido,
    fechaRequerida: s.fechaRequerida,
    observaciones: s.observaciones,
    estado: s.estado === "generando" ? "pendiente" : s.estado,
    motivoRechazo: s.motivoRechazo,
    recordId: s.recordId,
    recordSeq: s.recordSeq,
    atendidaAt: s.atendidaAt,
    atendidaPorNombre: s.atendidaPorNombre,
    createdAt: s.createdAt,
    creadoPorUserId: s.creadoPorUserId,
    creadoPorNombre: s.creadoPorNombre,
  };
}

// Aviso directo a la Bandeja: no sale de una regla de notificación, así que no se puede dar de baja. Nunca bloquea la
// atención de la solicitud.
function avisarSolicitante(s, { titulo, texto }, actor) {
  if (!s.creadoPorUserId) return;
  const base = s.actividad?.linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar";
  const contenido = {
    sistema: true,
    fuente: "compras",
    titulo,
    texto,
    notificacionNombre: "Solicitudes de compra",
    tituloItems: "Tu solicitud",
    items: [{ ref: s.actividad?.nombre || "", titulo: s.descripcion, contexto: s.valorEstimado != null ? `Valor estimado: ${Math.round(s.valorEstimado).toLocaleString("es-CO")}` : "", href: `${base}/actividades/${s.actividadId}` }],
  };
  prisma.notificacionEntrega.create({
    data: { userId: s.creadoPorUserId, userNombre: s.creadoPorNombre || "", canal: "app", estado: "enviada", enviadaAt: new Date(), contenido: JSON.stringify(contenido), creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
  }).catch(() => {});
}

const CON_ACTIVIDAD = { actividad: { select: { nombre: true, linea: true, fecha: true, estado: true } } };

export async function crearSolicitud(actividadId, body, actor) {
  const a = await prisma.actividadBienestar.findUnique({ where: { id: Number(actividadId) }, select: { id: true, estado: true } });
  if (!a) throw badRequest("Para solicitar una compra, primero debe estar registrada la actividad.", 404);
  if (a.estado === "cerrada") throw badRequest("La actividad está cerrada: no recibe compras nuevas.");
  const descripcion = texto(body?.descripcion, 2000);
  if (!descripcion) throw badRequest("Indica qué quieres comprar.");
  const fechaRequerida = fechaONula(body?.fechaRequerida);
  if (!fechaRequerida) throw badRequest("Indica la fecha en que debe llegar.");
  let valorEstimado = null;
  if (body?.valorEstimado !== "" && body?.valorEstimado != null) {
    valorEstimado = Number(body.valorEstimado);
    if (!Number.isFinite(valorEstimado) || valorEstimado < 0) throw badRequest("El valor estimado debe ser un valor en pesos, cero o mayor.");
  }
  let categoria = null;
  let categoriaId = null;
  if (body?.categoriaId) {
    const m = await prisma.maestro.findFirst({ where: { id: String(body.categoriaId), tipo: "categoria", activo: true }, select: { id: true, valor: true } });
    if (!m) throw badRequest("La categoría no está en los maestros de Compras.");
    categoria = m.valor;
    categoriaId = m.id;
  }
  const row = await prisma.solicitudCompra.create({
    data: {
      actividadId: a.id, descripcion, valorEstimado, categoria, categoriaId,
      proveedorSugerido: texto(body?.proveedorSugerido, 200), fechaRequerida, observaciones: texto(body?.observaciones, 2000),
      creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null,
    },
    include: CON_ACTIVIDAD,
  });
  const cliente = toClientSolicitud(row);
  logSolicitudCompraCreada(actor, cliente).catch(() => {});
  return cliente;
}

export async function solicitudesPendientes() {
  const rows = await prisma.solicitudCompra.findMany({ where: { estado: { in: ["pendiente", "generando"] } }, include: CON_ACTIVIDAD, orderBy: { createdAt: "asc" } });
  return rows.map(toClientSolicitud);
}

export const contarPendientes = () => prisma.solicitudCompra.count({ where: { estado: { in: ["pendiente", "generando"] } } });

export async function solicitudesDeActividad(actividadId) {
  const rows = await prisma.solicitudCompra.findMany({ where: { actividadId: Number(actividadId) }, include: CON_ACTIVIDAD, orderBy: { createdAt: "desc" } });
  return rows.map(toClientSolicitud);
}

async function pendienteOError(id) {
  const s = await prisma.solicitudCompra.findUnique({ where: { id: Number(id) }, include: CON_ACTIVIDAD });
  if (!s) throw badRequest("Solicitud no encontrada.", 404);
  if (s.estado !== "pendiente") throw badRequest("Esta solicitud ya fue atendida.", 409);
  return s;
}

// Crea la compra con lo que quedó en el formulario y la asocia a la actividad de la solicitud (el servidor la fija: no
// depende de lo que mande el formulario). Se aparta la solicitud antes de crear para que dos personas no generen dos
// compras con la misma; si la compra no se puede crear, vuelve a quedar pendiente.
export async function generarCompra(id, body, actor) {
  const s = await pendienteOError(id);
  const apartada = await prisma.solicitudCompra.updateMany({ where: { id: s.id, estado: "pendiente" }, data: { estado: "generando" } });
  if (!apartada.count) throw badRequest("Esta solicitud ya fue atendida.", 409);
  let record;
  try {
    record = await createRecord({ ...body, actividadId: s.actividadId }, actor);
  } catch (err) {
    await prisma.solicitudCompra.update({ where: { id: s.id }, data: { estado: "pendiente" } });
    throw err;
  }
  const row = await prisma.solicitudCompra.update({
    where: { id: s.id },
    data: { estado: "creada", recordId: record.id, recordSeq: record.localSeq ?? null, atendidaAt: new Date(), atendidaPorUserId: actor?.id || null, atendidaPorNombre: actor?.nombre || null },
    include: CON_ACTIVIDAD,
  });
  logSolicitudCompra(actor, toClientSolicitud(row), "editar", `Generó la compra #${record.localSeq ?? record.id}`).catch(() => {});
  avisarSolicitante(row, {
    titulo: `Se registró la compra #${record.localSeq ?? ""} que pediste`,
    texto: `${actor?.nombre || "Compras"} registró tu solicitud para la actividad ${row.actividad?.nombre || ""}.`,
  }, actor);
  return record;
}

export async function rechazarSolicitud(id, motivo, actor) {
  const s = await pendienteOError(id);
  const m = texto(motivo, 1000);
  if (!m || m.length < 5) throw badRequest("Indica por qué se rechaza la compra.");
  const r = await prisma.solicitudCompra.updateMany({ where: { id: s.id, estado: "pendiente" }, data: { estado: "rechazada", motivoRechazo: m, atendidaAt: new Date(), atendidaPorUserId: actor?.id || null, atendidaPorNombre: actor?.nombre || null } });
  if (!r.count) throw badRequest("Esta solicitud ya fue atendida.", 409);
  logSolicitudCompra(actor, toClientSolicitud(s), "editar", `Rechazó la solicitud: ${m}`).catch(() => {});
  avisarSolicitante(s, {
    titulo: "Rechazaron tu solicitud de compra",
    texto: `${actor?.nombre || "Compras"} la rechazó para la actividad ${s.actividad?.nombre || ""}. Motivo: ${m}`,
  }, actor);
}

// Quien administra la actividad puede retirar una solicitud mientras nadie la haya atendido.
export async function cancelarSolicitud(actividadId, id, actor) {
  const s = await pendienteOError(id);
  if (s.actividadId !== Number(actividadId)) throw badRequest("Solicitud no encontrada.", 404);
  const r = await prisma.solicitudCompra.updateMany({ where: { id: s.id, estado: "pendiente" }, data: { estado: "cancelada", atendidaAt: new Date(), atendidaPorUserId: actor?.id || null, atendidaPorNombre: actor?.nombre || null } });
  if (!r.count) throw badRequest("Esta solicitud ya fue atendida.", 409);
  logSolicitudCompra(actor, toClientSolicitud(s), "editar", "Canceló la solicitud").catch(() => {});
}
