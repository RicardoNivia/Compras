import { prisma } from "@/lib/prisma";
import { createProveedor } from "@/lib/proveedores";
import { calcularFaltantes } from "@/lib/agenteCorreoProveedores";
import { logSolicitudProveedorCorreo } from "@/lib/audit";

// Solicitudes de creación de proveedor que el agente de correo encontró (ver lib/agenteCorreoProveedores.js).
// Cada una es de la persona dueña del buzón (un admin también puede verlas). Aprobar crea el proveedor con
// lib/proveedores.js#createProveedor (mismas validaciones, auditoría y ciclo que el formulario); si falta algo,
// el cliente abre el formulario con lo que falta y lo vuelve a enviar aquí.

const err = (m, status = 400) => Object.assign(new Error(m), { status });
const parse = (s, def) => { try { return s ? JSON.parse(s) : def; } catch { return def; } };
const ETIQUETA = { nit: "NIT", nombre: "Razón social", descripcion: "Descripción" };

// Campos del formulario de proveedor que el cliente puede corregir al aprobar.
const CAMPOS = ["nombre", "nit", "descripcion", "telefono", "correo", "internacional", "areaId", "tipoServicioId", "tipoProveedorId", "clasificacionMontoId", "revision", "observacion", "esExcepcion", "motivoExcepcionId", "justificacionExcepcion"];

export function toClientSolicitud(s, faltantes) {
  return {
    id: s.id,
    estado: s.estado,
    remitente: s.remitente,
    asunto: s.asunto,
    recibidoAt: s.recibidoAt,
    resumen: s.resumen,
    webLink: s.webLink,
    datos: parse(s.datos, {}),
    faltantes: faltantes ?? parse(s.faltantes, []),
    notas: parse(s.notas, []),
    adjuntos: parse(s.adjuntos, []),
    nit: s.nit,
    proveedorNit: s.proveedorNit,
    motivoDescarte: s.motivoDescarte,
    resueltoAt: s.resueltoAt,
    resueltoPorNombre: s.resueltoPorNombre,
    userNombre: s.userNombre,
    createdAt: s.createdAt,
    creadoPorNombre: s.creadoPorNombre,
  };
}

async function cargar(user, id) {
  const s = await prisma.solicitudProveedorCorreo.findUnique({ where: { id: Number(id) || 0 } });
  if (!s || (s.userId !== user.id && user.role !== "admin")) throw err("No se encontró la solicitud.", 404);
  return s;
}

export async function listSolicitudes(user, { estado, page = 1, size = 10 } = {}) {
  const where = { userId: user.id, ...(estado ? { estado } : {}) };
  const total = await prisma.solicitudProveedorCorreo.count({ where });
  const paginas = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Number(page) || 1), paginas);
  const rows = await prisma.solicitudProveedorCorreo.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p - 1) * size, take: size });
  return { items: rows.map((s) => toClientSolicitud(s)), total, page: p, size };
}

// Los faltantes de una pendiente se recalculan al leerla: el NIT pudo registrarse después.
export async function getSolicitud(user, id) {
  const s = await cargar(user, id);
  const faltantes = s.estado === "pendiente" ? await calcularFaltantes(parse(s.datos, {})) : undefined;
  return toClientSolicitud(s, faltantes);
}

export async function aprobarSolicitud(user, id, body = {}) {
  const s = await cargar(user, id);
  if (s.estado !== "pendiente") throw err(s.estado === "aprobada" ? `Esta solicitud ya se aprobó (proveedor ${s.proveedorNit}).` : "Esta solicitud se descartó.");
  const datos = { ...parse(s.datos, {}) };
  for (const c of CAMPOS) if (body[c] !== undefined) datos[c] = body[c];

  const faltantes = await calcularFaltantes(datos);
  if (faltantes.length) {
    throw Object.assign(err(`Falta completar: ${faltantes.map((f) => `${ETIQUETA[f.campo]} (${f.motivo})`).join("; ")}`), { faltantes });
  }
  const proveedor = await createProveedor(datos, user);
  // Solo si sigue pendiente (dos clics a la vez no la aprueban dos veces; el NIT ya no se puede repetir).
  const r = await prisma.solicitudProveedorCorreo.updateMany({
    where: { id: s.id, estado: "pendiente" },
    data: { estado: "aprobada", proveedorNit: proveedor.nit, datos: JSON.stringify(datos), faltantes: "[]", resueltoAt: new Date(), resueltoPorUserId: user.id, resueltoPorNombre: user.nombre || null },
  });
  if (r.count) logSolicitudProveedorCorreo(user, "aprobar", s, { estado: "pendiente" }, { estado: "aprobada", proveedorNit: proveedor.nit, nombre: proveedor.nombre }).catch(() => {});
  return { proveedor, solicitud: await getSolicitud(user, s.id) };
}

export async function descartarSolicitud(user, id, motivo) {
  const s = await cargar(user, id);
  if (s.estado !== "pendiente") throw err("Esta solicitud ya no está pendiente.");
  const m = String(motivo || "").replace(/�/g, "").trim().slice(0, 300) || null;
  await prisma.solicitudProveedorCorreo.update({
    where: { id: s.id },
    data: { estado: "descartada", motivoDescarte: m, resueltoAt: new Date(), resueltoPorUserId: user.id, resueltoPorNombre: user.nombre || null },
  });
  logSolicitudProveedorCorreo(user, "descartar", s, { estado: "pendiente" }, { estado: "descartada", motivoDescarte: m }).catch(() => {});
  return getSolicitud(user, s.id);
}
