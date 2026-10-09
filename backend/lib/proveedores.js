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

// "En uso" cubre dos casos:
// 1. Registros nuevos: Record.nit coincide con el nit del proveedor (caso normal).
// 2. Registros históricos (anteriores a este catálogo, o importados por el
//    backfill con nit placeholder — ver migración proveedores_backfill_desde_historico):
//    Record.nit es null pero Record.proveedor coincide con el nombre del
//    proveedor. Sin este segundo caso, cualquier proveedor cuyo nit sea un
//    placeholder nunca aparece "en uso" (ningún registro tiene ESE nit
//    exacto) aunque su nombre sí esté citado en cientos de compras —
//    permitiendo borrarlo/renombrarlo por error.
export async function isProveedorInUse(nit, nombre) {
  const count = await prisma.record.count({
    where: { OR: [{ nit }, { nit: null, proveedor: nombre }] },
  });
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
  // Dos sets en vez de N+1: todos los nit usados hoy, y todos los nombres de
  // registros SIN nit (histórico) — ver isProveedorInUse para el porqué.
  const [conNit, sinNit] = await Promise.all([
    prisma.record.findMany({ where: { nit: { not: null } }, select: { nit: true }, distinct: ["nit"] }),
    prisma.record.findMany({ where: { nit: null, proveedor: { not: null } }, select: { proveedor: true }, distinct: ["proveedor"] }),
  ]);
  const nitsUsados = new Set(conNit.map((r) => r.nit).filter(Boolean));
  const nombresSinNitUsados = new Set(sinNit.map((r) => r.proveedor).filter(Boolean));
  return rows.map((row) => toClientProveedor(row, nitsUsados.has(row.nit) || nombresSinNitUsados.has(row.nombre)));
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

  const enUso = await isProveedorInUse(current.nit, current.nombre);
  const data = {};
  if (body.activo !== undefined) data.activo = !!body.activo;
  if (body.telefono !== undefined) data.telefono = textOrNull(body.telefono);
  if (body.correo !== undefined) data.correo = textOrNull(body.correo);
  if (body.documentacionAlDia !== undefined) data.documentacionAlDia = !!body.documentacionAlDia;

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
    if (nit !== current.nit) {
      if (enUso) {
        const err = new Error("No se puede editar el NIT: este proveedor ya está en uso en registros existentes.");
        err.status = 409;
        throw err;
      }
      data.nit = nit;
    }
  }

  try {
    const row = await prisma.proveedor.update({ where: { id }, data });
    const after = toClientProveedor(row, await isProveedorInUse(row.nit, row.nombre));
    await logProveedorUpdate(actor, toClientProveedor(current, enUso), after).catch(() => {});
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
  if (await isProveedorInUse(current.nit, current.nombre)) {
    const err = new Error("No se puede eliminar: este proveedor ya está en uso en registros existentes.");
    err.status = 409;
    throw err;
  }
  await prisma.proveedor.delete({ where: { id } });
  await logProveedorDelete(actor, toClientProveedor(current, false)).catch(() => {});
}
