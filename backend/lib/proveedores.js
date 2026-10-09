import { prisma } from "@/lib/prisma";
import { logProveedorCreate, logProveedorUpdate, logProveedorDelete } from "@/lib/audit";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Solo dígitos — igual que el campo Record.nit (sin dígito de verificación).
function normalizeNit(v) {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

// Teléfono/correo no se validan con formato estricto — son solo de
// referencia para que Nova (Agente IA) pueda citarlos al responder.
function textOrNull(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

export function toClientProveedor(p, enUso = false) {
  return {
    id: p.id,
    codigo: p.codigo,
    nit: p.nit,
    nombre: p.nombre,
    descripcion: p.descripcion,
    telefono: p.telefono,
    correo: p.correo,
    documentacionAlDia: p.documentacionAlDia,
    activo: p.activo,
    enUso,
    createdAt: p.createdAt,
  };
}

// La referencia real de un registro a un proveedor es Record.proveedorId =
// Proveedor.codigo (entero autoincremental, nunca cambia) — no el nit ni el
// nombre, que son solo texto descriptivo. Por eso nit/nombre se pueden
// corregir libremente incluso si el proveedor está en uso: cambiarlos nunca
// rompe la referencia. Solo eliminar el proveedor está bloqueado si está en uso.
export async function isProveedorInUse(codigo) {
  const count = await prisma.record.count({ where: { proveedorId: codigo } });
  return count > 0;
}

export async function listProveedores({ onlyActive, search } = {}) {
  const where = {};
  if (onlyActive) where.activo = true;
  if (search) {
    const q = String(search).trim();
    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: "insensitive" } },
        { nit: { contains: normalizeNit(q) || q } },
      ];
    }
  }

  const rows = await prisma.proveedor.findMany({ where, orderBy: { nombre: "asc" } });
  // Un solo IN en vez de N+1: todos los proveedorId usados hoy en registros.
  const usados = new Set(
    (await prisma.record.findMany({ where: { proveedorId: { not: null } }, select: { proveedorId: true }, distinct: ["proveedorId"] }))
      .map((r) => r.proveedorId)
  );
  return rows.map((row) => toClientProveedor(row, usados.has(row.codigo)));
}

export async function createProveedor(body, actor) {
  const nit = normalizeNit(body.nit);
  const nombre = (body.nombre || "").trim();
  const descripcion = (body.descripcion || "").trim();
  if (!nit) throw badRequest("El NIT es obligatorio.");
  if (!nombre) throw badRequest("El nombre es obligatorio.");
  if (!descripcion) throw badRequest("La descripción es obligatoria.");

  try {
    const row = await prisma.proveedor.create({
      data: {
        nit, nombre, descripcion,
        telefono: textOrNull(body.telefono), correo: textOrNull(body.correo),
        documentacionAlDia: !!body.documentacionAlDia,
        activo: body.activo ?? true,
      },
    });
    const proveedor = toClientProveedor(row, false);
    await logProveedorCreate(actor, proveedor).catch(() => {});
    return proveedor;
  } catch (err) {
    if (err.code === "P2002") throw badRequest("Ya existe un proveedor con ese NIT.");
    throw err;
  }
}

export async function updateProveedor(id, body, actor) {
  const current = await prisma.proveedor.findUnique({ where: { id } });
  if (!current) {
    const err = new Error("Proveedor no encontrado.");
    err.status = 404;
    throw err;
  }

  const enUsoAntes = await isProveedorInUse(current.codigo);
  const data = {};
  if (body.activo !== undefined) data.activo = !!body.activo;
  if (body.telefono !== undefined) data.telefono = textOrNull(body.telefono);
  if (body.correo !== undefined) data.correo = textOrNull(body.correo);
  if (body.documentacionAlDia !== undefined) data.documentacionAlDia = !!body.documentacionAlDia;

  // nit y nombre se pueden editar libremente, en uso o no — la referencia
  // real es "codigo", que nunca cambia (ver comentario de isProveedorInUse).
  // Como los registros leen el nombre/nit ACTUAL del catálogo al listar (ver
  // hydrateConDatosActuales en lib/records.js), este cambio se refleja solo.
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) throw badRequest("El nombre es obligatorio.");
    data.nombre = nombre;
  }

  if (body.descripcion !== undefined) {
    const descripcion = String(body.descripcion).trim();
    if (!descripcion) throw badRequest("La descripción es obligatoria.");
    data.descripcion = descripcion;
  }

  if (body.nit !== undefined) {
    const nit = normalizeNit(body.nit);
    if (!nit) throw badRequest("El NIT es obligatorio.");
    data.nit = nit;
  }

  try {
    const row = await prisma.proveedor.update({ where: { id }, data });
    const after = toClientProveedor(row, await isProveedorInUse(row.codigo));
    await logProveedorUpdate(actor, toClientProveedor(current, enUsoAntes), after).catch(() => {});
    return after;
  } catch (err) {
    if (err.code === "P2002") throw badRequest("Ya existe un proveedor con ese NIT.");
    throw err;
  }
}

export async function deleteProveedor(id, actor) {
  const current = await prisma.proveedor.findUnique({ where: { id } });
  if (!current) {
    const err = new Error("Proveedor no encontrado.");
    err.status = 404;
    throw err;
  }
  if (await isProveedorInUse(current.codigo)) {
    const err = new Error("No se puede eliminar: este proveedor ya está en uso en registros existentes.");
    err.status = 409;
    throw err;
  }
  await prisma.proveedor.delete({ where: { id } });
  await logProveedorDelete(actor, toClientProveedor(current, false)).catch(() => {});
}
