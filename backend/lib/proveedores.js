import { prisma } from "@/lib/prisma";
import { logProveedorCreate, logProveedorUpdate, logProveedorDelete } from "@/lib/audit";
import { CRITICIDADES, CLASIFICACIONES_MONTO, REVISIONES } from "@/lib/proveedoresCicloReglas";
import { asegurarCicloVigente, alertasPorProveedor } from "@/lib/proveedoresCiclo";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Solo dígitos — igual que el campo Record.nit (sin dígito de verificación).
function normalizeNit(v) {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

function textOrNull(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

// El área es un maestro (tipo "area"): se guarda el id y el nombre como snapshot,
// nunca el texto que mande el cliente (ver convención de referencias por id en CLAUDE.md).
async function resolverArea(areaId) {
  if (!areaId) return { areaId: null, area: null };
  const maestro = await prisma.maestro.findFirst({ where: { id: areaId, tipo: "area", activo: true } });
  if (!maestro) throw badRequest("El área no existe en Maestros.");
  return { areaId: maestro.id, area: maestro.valor };
}

// Valida un valor contra la lista de opciones del selector (vacío = sin definir).
function opcionValida(v, lista, nombre) {
  if (v === null || v === undefined || v === "") return null;
  if (!lista.includes(v)) throw badRequest(`${nombre} inválida. Opciones: ${lista.join(", ")}.`);
  return v;
}

function criticidadValida(v) {
  if (v === null || v === undefined || v === "") return null;
  if (!CRITICIDADES.includes(v)) throw badRequest("La criticidad debe ser Crítico o No crítico.");
  return v;
}

export function toClientProveedor(p, enUso = false) {
  return {
    id: p.id,
    nit: p.nit,
    nombre: p.nombre,
    descripcion: p.descripcion,
    telefono: p.telefono,
    correo: p.correo,
    internacional: p.internacional,
    activo: p.activo,
    inactivoMotivo: p.inactivoMotivo,
    criticidad: p.criticidad,
    areaId: p.areaId,
    area: p.area,
    servicio: p.servicio,
    clasificacionMonto: p.clasificacionMonto,
    revision: p.revision,
    observacion: p.observacion,
    esExcepcion: p.esExcepcion,
    motivoExcepcionId: p.motivoExcepcionId,
    motivoExcepcion: p.motivoExcepcion,
    justificacionExcepcion: p.justificacionExcepcion,
    enUso,
    createdAt: p.createdAt,
  };
}

// La referencia real de un registro a un proveedor es Record.proveedorId =
// Proveedor.id (nunca cambia). nit/nombre se pueden corregir aunque esté en uso;
// solo eliminar está bloqueado si hay registros que lo usan.
export async function isProveedorInUse(id) {
  const count = await prisma.record.count({ where: { proveedorId: id } });
  return count > 0;
}

// Listado plano del catálogo (autocompletar de Registros, formularios). Incluye
// la alerta del ciclo vigente para que Compras la vea al elegir el proveedor.
export async function listProveedores({ onlyActive, search } = {}) {
  await asegurarCicloVigente();
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
  const usados = new Set(
    (await prisma.record.findMany({ where: { proveedorId: { not: null } }, select: { proveedorId: true }, distinct: ["proveedorId"] }))
      .map((r) => r.proveedorId)
  );
  const alertas = await alertasPorProveedor();
  return rows.map((row) => ({ ...toClientProveedor(row, usados.has(row.id)), alerta: alertas[row.id] || null }));
}

export async function createProveedor(body, actor) {
  const nit = normalizeNit(body.nit);
  const nombre = (body.nombre || "").trim();
  const descripcion = (body.descripcion || "").trim();
  if (!nit) throw badRequest("El NIT es obligatorio.");
  if (!nombre) throw badRequest("El nombre es obligatorio.");
  if (!descripcion) throw badRequest("La descripción es obligatoria.");
  const area = await resolverArea(body.areaId || null);

  try {
    const row = await prisma.proveedor.create({
      data: {
        nit, nombre, descripcion,
        telefono: textOrNull(body.telefono), correo: textOrNull(body.correo),
        internacional: !!body.internacional,
        activo: body.activo ?? true,
        criticidad: criticidadValida(body.criticidad),
        areaId: area.areaId, area: area.area,
        servicio: textOrNull(body.servicio),
        clasificacionMonto: opcionValida(body.clasificacionMonto, CLASIFICACIONES_MONTO, "La clasificación por monto"),
        revision: opcionValida(body.revision, REVISIONES, "La revisión"),
        observacion: textOrNull(body.observacion),
      },
    });
    const proveedor = toClientProveedor(row, false);
    await logProveedorCreate(actor, proveedor).catch(() => {});
    await asegurarCicloVigente();
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

  const enUsoAntes = await isProveedorInUse(current.id);
  const data = {};
  if (body.telefono !== undefined) data.telefono = textOrNull(body.telefono);
  if (body.correo !== undefined) data.correo = textOrNull(body.correo);
  if (body.internacional !== undefined) data.internacional = !!body.internacional;
  if (body.criticidad !== undefined) data.criticidad = criticidadValida(body.criticidad);
  if (body.servicio !== undefined) data.servicio = textOrNull(body.servicio);
  if (body.clasificacionMonto !== undefined) data.clasificacionMonto = opcionValida(body.clasificacionMonto, CLASIFICACIONES_MONTO, "La clasificación por monto");
  if (body.revision !== undefined) data.revision = opcionValida(body.revision, REVISIONES, "La revisión");
  if (body.observacion !== undefined) data.observacion = textOrNull(body.observacion);
  if (body.areaId !== undefined) Object.assign(data, await resolverArea(body.areaId || null));

  // Estado activo y excepción se cambian por su propio endpoint (lib/proveedoresCiclo.js),
  // que valida el motivo y registra el cambio en el histórico del ciclo.

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
    const after = toClientProveedor(row, await isProveedorInUse(row.id));
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
  if (await isProveedorInUse(current.id)) {
    const err = new Error("No se puede eliminar: este proveedor ya está en uso en registros existentes. Márcalo como inactivo.");
    err.status = 409;
    throw err;
  }
  await prisma.proveedor.delete({ where: { id } });
  await logProveedorDelete(actor, toClientProveedor(current, false)).catch(() => {});
}
