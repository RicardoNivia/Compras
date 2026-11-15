import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { analizarLeido } from "@/lib/tesoreria/soportes";
import { badRequest, notFound, limpiar, fmtMoneda } from "@/lib/tesoreria/comun";

// Soportes de pago que llegaron al correo de soportes (ver lib/buzonCompartido.js). Nova ya los leyó; aquí la
// persona los revisa: «Registrar» abre el formulario de movimiento con el comprobante y lo leído (sin volver a pagar
// la lectura) y, al guardar, el soporte queda «registrado» con su movimiento. «Descartar» lo saca de la lista.

const parse = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
const ESTADOS = ["pendiente", "registrado", "descartado"];

function toClient(s) {
  const leido = parse(s.leido);
  return {
    id: s.id, estado: s.estado, remitente: s.remitente, asunto: s.asunto, recibidoAt: s.recibidoAt, webLink: s.webLink,
    archivoNombre: s.archivoNombre, tipoMime: s.tipoMime, tamano: s.tamano, conArchivo: !!s.archivoNombre,
    leido, sugerencia: s.sugerencia ? parse(s.sugerencia) : null, valorTexto: leido.valor ? fmtMoneda(leido.tipo === "credito" ? leido.valor : -leido.valor) : null,
    movimientoId: s.movimientoId, motivoDescarte: s.motivoDescarte, resueltoAt: s.resueltoAt, resueltoPorNombre: s.resueltoPorNombre,
    createdAt: s.createdAt, creadoPorNombre: s.creadoPorNombre,
  };
}

// Todo menos el archivo (la lista no lo necesita).
const SIN_CONTENIDO = Object.fromEntries(["id", "estado", "remitente", "asunto", "recibidoAt", "webLink", "archivoNombre", "tipoMime", "tamano", "leido", "sugerencia",
  "movimientoId", "motivoDescarte", "resueltoAt", "resueltoPorNombre", "createdAt", "creadoPorNombre"].map((k) => [k, true]));

export async function listarSoportesCorreo({ estado = "pendiente", page = 1, size = 10 } = {}) {
  const where = ESTADOS.includes(estado) ? { estado } : {};
  const total = await prisma.soporteCorreoTesoreria.count({ where });
  const tam = Math.min(Math.max(1, Number(size) || 10), 100);
  const paginas = Math.max(1, Math.ceil(total / tam));
  const p = Math.min(Math.max(1, Number(page) || 1), paginas);
  const filas = await prisma.soporteCorreoTesoreria.findMany({
    where, orderBy: [{ recibidoAt: "desc" }, { id: "desc" }], skip: (p - 1) * tam, take: tam,
    select: SIN_CONTENIDO,
  });
  return { items: filas.map(toClient), total, page: p, size: tam };
}

async function cargar(id) {
  const s = await prisma.soporteCorreoTesoreria.findUnique({ where: { id: Number(id) || 0 } });
  if (!s) throw notFound("El soporte no existe.");
  return s;
}

// Detalle para registrarlo: lo que Nova leyó + movimientos que ya parecen ser este + pagos posibles (calculados ahora,
// por código, sin volver a llamar a Nova).
export async function detalleSoporteCorreo(id) {
  const s = await cargar(id);
  const leido = parse(s.leido);
  const guardada = s.sugerencia ? parse(s.sugerencia) : null;
  // La sugerencia de Nova se pidió al llegar; si entonces no había candidatos (p. ej. aún no estaba el extracto), se pide ahora.
  const analisis = s.estado === "pendiente" ? await analizarLeido(leido, { sugerencia: guardada, conNova: !guardada }) : { coincidencias: [], pagosPosibles: [], sugerencia: guardada };
  if (!guardada && analisis.sugerencia) {
    await prisma.soporteCorreoTesoreria.update({ where: { id: s.id }, data: { sugerencia: JSON.stringify(analisis.sugerencia) } }).catch(() => {});
  }
  const mismo = s.sha1 ? await prisma.soporteMovimiento.findFirst({ where: { sha1: s.sha1 }, select: { movimientoId: true } }) : null;
  return { ...toClient(s), lectura: { leido, ...analisis, duplicado: mismo ? `Este mismo archivo ya es soporte del movimiento #${mismo.movimientoId}.` : null } };
}

export async function archivoSoporteCorreo(actor, id) {
  const s = await cargar(id);
  if (!s.contenido) throw notFound("Este soporte llegó en el texto del correo, sin archivo.");
  logTesoreria(actor, { action: "descargar", entityType: "soporteCorreoTesoreria", recordId: s.id, recordInfo: `Soporte del correo «${s.asunto || "sin asunto"}»` }).catch(() => {});
  return s;
}

// Se llama después de guardar el movimiento (o de adjuntar el soporte a uno que ya existía).
export async function marcarRegistrado(actor, id, movimientoId) {
  const s = await cargar(id);
  if (s.estado !== "pendiente") throw badRequest(s.estado === "registrado" ? `Este soporte ya se registró (movimiento #${s.movimientoId}).` : "Este soporte se descartó.");
  const mv = await prisma.movimientoBanco.findUnique({ where: { id: Number(movimientoId) || 0 }, select: { id: true, concepto: true, descripcion: true } });
  if (!mv) throw badRequest("El movimiento no existe.");
  const r = await prisma.soporteCorreoTesoreria.updateMany({
    where: { id: s.id, estado: "pendiente" },
    data: { estado: "registrado", movimientoId: mv.id, resueltoAt: new Date(), resueltoPorUserId: actor.id, resueltoPorNombre: actor.nombre || null },
  });
  if (r.count) {
    logTesoreria(actor, {
      action: "aprobar", entityType: "soporteCorreoTesoreria", recordId: s.id, recordInfo: `Soporte del correo «${s.asunto || "sin asunto"}»`,
      before: { estado: "pendiente" }, after: { estado: "registrado", movimiento: `#${mv.id} ${mv.concepto || mv.descripcion}` },
    }).catch(() => {});
  }
  return { ok: true };
}

export async function descartarSoporteCorreo(actor, id, motivo) {
  const s = await cargar(id);
  if (s.estado !== "pendiente") throw badRequest("Este soporte ya no está pendiente.");
  const m = limpiar(motivo, 300);
  await prisma.soporteCorreoTesoreria.update({
    where: { id: s.id },
    data: { estado: "descartado", motivoDescarte: m, resueltoAt: new Date(), resueltoPorUserId: actor.id, resueltoPorNombre: actor.nombre || null },
  });
  logTesoreria(actor, {
    action: "descartar", entityType: "soporteCorreoTesoreria", recordId: s.id, recordInfo: `Soporte del correo «${s.asunto || "sin asunto"}»`,
    before: { estado: "pendiente" }, after: { estado: "descartado", motivoDescarte: m },
  }).catch(() => {});
  return { ok: true };
}

export const contarSoportesCorreo = () => prisma.soporteCorreoTesoreria.count({ where: { estado: "pendiente" } });
