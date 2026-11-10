import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logFotos } from "@/lib/audit";

// Material fotográfico de las actividades de Bienestar (FotoActividad). Llegan ya reducidas desde el navegador
// (imagen ≤ 1.600 px y miniatura ≤ 480 px): aquí se valida que de verdad sean imágenes (por su firma, no por la
// extensión), el tamaño y que no estén repetidas en la misma actividad.

const MAX_IMAGEN = 3 * 1024 * 1024;
const MAX_MINIATURA = 600 * 1024;
const MAX_POR_ACTIVIDAD = 200;

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Tipo real por los primeros bytes (JPEG, PNG o WebP); cualquier otra cosa se rechaza.
export function mimeDe(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export function toClientFoto(f) {
  return {
    id: f.id,
    actividadId: f.actividadId,
    nombre: f.nombre,
    descripcion: f.descripcion,
    ancho: f.ancho,
    alto: f.alto,
    bytes: f.bytes,
    origen: f.origen,
    fuente: f.fuente,
    createdAt: f.createdAt,
    creadoPorNombre: f.creadoPorNombre,
  };
}

const SIN_BYTES = { id: true, actividadId: true, nombre: true, descripcion: true, ancho: true, alto: true, bytes: true, origen: true, fuente: true, createdAt: true, creadoPorNombre: true };

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

export async function listFotos(actividadId) {
  const a = await actividadOError(actividadId);
  const rows = await prisma.fotoActividad.findMany({ where: { actividadId: a.id }, select: SIN_BYTES, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return rows.map(toClientFoto);
}

export async function crearFoto(actividadId, { imagen, miniatura, nombre, descripcion, ancho, alto }, actor) {
  const a = await actividadEditable(actividadId);
  if (!imagen?.length || !miniatura?.length) throw badRequest("Falta la imagen.");
  if (imagen.length > MAX_IMAGEN) throw badRequest("La imagen pasa de 3 MB incluso reducida.");
  if (miniatura.length > MAX_MINIATURA) throw badRequest("La miniatura es demasiado grande.");
  const mime = mimeDe(imagen);
  if (!mime || !mimeDe(miniatura)) throw badRequest("Solo se aceptan fotos JPG, PNG o WebP.");
  if ((await prisma.fotoActividad.count({ where: { actividadId: a.id } })) >= MAX_POR_ACTIVIDAD) throw badRequest(`Una actividad admite hasta ${MAX_POR_ACTIVIDAD} fotos.`);
  const hash = createHash("sha1").update(imagen).digest("hex");
  if (await prisma.fotoActividad.findUnique({ where: { actividadId_hash: { actividadId: a.id, hash } }, select: { id: true } })) {
    throw badRequest("Esa foto ya está en la actividad.", 409);
  }
  const row = await prisma.fotoActividad.create({
    data: {
      actividadId: a.id, nombre: String(nombre || "foto").slice(0, 200), descripcion: String(descripcion || "").trim().slice(0, 500) || null,
      mime, ancho: Math.max(1, Math.round(Number(ancho) || 1)), alto: Math.max(1, Math.round(Number(alto) || 1)),
      bytes: imagen.length, datos: imagen, miniatura, hash, origen: "app",
      creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null,
    },
    select: SIN_BYTES,
  });
  logFotos(actor, a, "crear", `Subió la foto ${row.nombre}`).catch(() => {});
  return toClientFoto(row);
}

// La imagen (o su miniatura) para mostrarla: { buffer, mime }.
export async function imagenDeFoto(actividadId, id, { miniatura = false } = {}) {
  const f = await prisma.fotoActividad.findFirst({
    where: { id: Number(id), actividadId: Number(actividadId) },
    select: { mime: true, datos: !miniatura, miniatura, updatedAt: true },
  });
  if (!f) throw badRequest("Foto no encontrada.", 404);
  const buffer = Buffer.from(miniatura ? f.miniatura : f.datos);
  return { buffer, mime: miniatura ? mimeDe(buffer) || "image/jpeg" : f.mime, version: f.updatedAt.getTime() };
}

export async function actualizarFoto(actividadId, id, body, actor) {
  const a = await actividadEditable(actividadId);
  const f = await prisma.fotoActividad.findFirst({ where: { id: Number(id), actividadId: a.id }, select: { id: true, nombre: true } });
  if (!f) throw badRequest("Foto no encontrada.", 404);
  const row = await prisma.fotoActividad.update({ where: { id: f.id }, data: { descripcion: String(body?.descripcion ?? "").trim().slice(0, 500) || null }, select: SIN_BYTES });
  logFotos(actor, a, "editar", `Descripción de ${row.nombre}: ${row.descripcion || "—"}`).catch(() => {});
  return toClientFoto(row);
}

export async function eliminarFoto(actividadId, id, actor) {
  const a = await actividadEditable(actividadId);
  const f = await prisma.fotoActividad.findFirst({ where: { id: Number(id), actividadId: a.id }, select: { id: true, nombre: true } });
  if (!f) throw badRequest("Foto no encontrada.", 404);
  await prisma.fotoActividad.delete({ where: { id: f.id } });
  logFotos(actor, a, "eliminar", `Quitó la foto ${f.nombre}`).catch(() => {});
}
