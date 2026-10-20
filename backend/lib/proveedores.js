import { prisma } from "@/lib/prisma";
import { logProveedorCreate, logProveedorUpdate, logProveedorDelete } from "@/lib/audit";
import { REVISIONES, normalizeNit, nitValido } from "@/lib/proveedoresCicloReglas";

export { normalizeNit, nitValido };
import { asegurarCicloVigente, alertasPorProveedor, asegurarCicloDe } from "@/lib/proveedoresCiclo";
import { publicarEvento, publicarCambiosDeProveedor } from "@/lib/notificacionesEventos";

// El NIT es la llave primaria de Proveedor: todas las consultas, relaciones
// (Record.proveedorNit, ProveedorCiclo.proveedorNit…) y validaciones van por
// NIT. Corregir un NIT se propaga solo por FK (ON UPDATE CASCADE); los
// snapshots sin FK (Record.nit, CalificacionProveedor.proveedorNit) se
// actualizan en la misma transacción (ver cambiarNit).

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound() {
  const err = new Error("Proveedor no encontrado.");
  err.status = 404;
  return err;
}

// Un NIT que se escribe a mano: 5 a 20 letras/dígitos (con al menos un dígito). El
// provisional PENDIENTE-… solo existe por migración: no se puede crear ni asignar.
function validarNitNuevo(raw) {
  const nit = normalizeNit(raw);
  if (!nit) throw badRequest("El NIT es obligatorio.");
  if (/^PEND/.test(nit) || !nitValido(nit)) throw badRequest("NIT inválido: escribe solo el número, sin dígito de verificación (5 a 20 caracteres; se aceptan NIT extranjeros alfanuméricos).");
  return nit;
}

function textOrNull(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

// Tipo, clasificación por monto, tipo de servicio, área de proveedor (maestro propio,
// distinto del área de Compras) y motivo de excepción
// son maestros: se guarda el id y el nombre como snapshot, nunca el texto que
// mande el cliente (convención de referencias por id, ver CLAUDE.md).
const MAESTROS_PROVEEDOR = {
  tipoProveedor: { idField: "tipoProveedorId", textField: "criticidad", nombre: "El tipo (crítico / no crítico)" },
  clasificacionMonto: { idField: "clasificacionMontoId", textField: "clasificacionMonto", nombre: "La clasificación por monto" },
  tipoServicio: { idField: "tipoServicioId", textField: "servicio", nombre: "El tipo de servicio" },
  areaProveedor: { idField: "areaId", textField: "area", nombre: "El área del proveedor" },
};

async function resolverMaestro(tipo, id, permitirInactivoId = null) {
  const cfg = MAESTROS_PROVEEDOR[tipo];
  if (!id) return { [cfg.idField]: null, [cfg.textField]: null };
  const maestro = await prisma.maestro.findFirst({ where: { id, tipo } });
  // Un valor inactivo solo se acepta si es el que el proveedor ya tenía (no se fuerza a cambiarlo).
  if (!maestro || (!maestro.activo && maestro.id !== permitirInactivoId)) {
    throw badRequest(`${cfg.nombre} no existe o está inactivo en Maestros.`);
  }
  return { [cfg.idField]: maestro.id, [cfg.textField]: maestro.valor };
}

async function resolverMaestros(body, actual = null) {
  const data = {};
  for (const [tipo, cfg] of Object.entries(MAESTROS_PROVEEDOR)) {
    if (body[cfg.idField] === undefined) continue;
    Object.assign(data, await resolverMaestro(tipo, body[cfg.idField] || null, actual?.[cfg.idField] || null));
  }
  return data;
}

function opcionValida(v, lista, nombre) {
  if (v === null || v === undefined || v === "") return null;
  if (!lista.includes(v)) throw badRequest(`${nombre} inválida. Opciones: ${lista.join(", ")}.`);
  return v;
}

// Datos de excepción (al crear o editar). Una excepción no participa en el
// ciclo de actualización ni depende de fechas de registro o actualización.
async function resolverExcepcion(body, actual = null) {
  if (body.esExcepcion === undefined) return {};
  if (!body.esExcepcion) {
    return { esExcepcion: false, motivoExcepcionId: null, motivoExcepcion: null, justificacionExcepcion: null, fechaExcepcion: null, radicaFacturas: false, radicaFacturasAt: null };
  }
  const motivoId = body.motivoExcepcionId ?? actual?.motivoExcepcionId;
  const motivo = motivoId ? await prisma.maestro.findFirst({ where: { id: motivoId, tipo: "motivoExcepcion" } }) : null;
  if (!motivo || (!motivo.activo && motivo.id !== actual?.motivoExcepcionId)) {
    throw badRequest("Elige un motivo de excepción válido (Maestros › Motivo de excepción de proveedor).");
  }
  return {
    esExcepcion: true,
    motivoExcepcionId: motivo.id,
    motivoExcepcion: motivo.valor,
    justificacionExcepcion: body.justificacionExcepcion !== undefined ? textOrNull(body.justificacionExcepcion) : actual?.justificacionExcepcion ?? null,
    fechaExcepcion: actual?.esExcepcion ? actual.fechaExcepcion : new Date(),
  };
}

export function toClientProveedor(p, enUso = false) {
  return {
    id: p.nit, // alias: la llave primaria ES el NIT (se mantiene "id" para keys/rutas del cliente)
    nit: p.nit,
    nombre: p.nombre,
    descripcion: p.descripcion,
    telefono: p.telefono,
    correo: p.correo,
    internacional: p.internacional,
    activo: p.activo,
    inactivoMotivo: p.inactivoMotivo,
    tipoProveedorId: p.tipoProveedorId,
    criticidad: p.criticidad,
    areaId: p.areaId,
    area: p.area,
    tipoServicioId: p.tipoServicioId,
    servicio: p.servicio,
    clasificacionMontoId: p.clasificacionMontoId,
    clasificacionMonto: p.clasificacionMonto,
    revision: p.revision,
    observacion: p.observacion,
    esExcepcion: p.esExcepcion,
    motivoExcepcionId: p.motivoExcepcionId,
    motivoExcepcion: p.motivoExcepcion,
    justificacionExcepcion: p.justificacionExcepcion,
    fechaActualizacion: p.fechaActualizacion,
    enUso,
    createdAt: p.createdAt,
    creadoPorNombre: p.creadoPorNombre,
  };
}

// La referencia real de un registro a un proveedor es Record.proveedorNit
// (FK a Proveedor.nit). Eliminar está bloqueado si hay registros que lo usan.
export async function isProveedorInUse(nit) {
  const count = await prisma.record.count({ where: { proveedorNit: nit } });
  return count > 0;
}

// Validación en tiempo real del formulario: ¿ya existe un proveedor con ese NIT?
export async function verificarNit(raw, excluir) {
  const nit = normalizeNit(raw);
  const valido = nitValido(nit);
  if (!nit) return { nit, valido: false, existe: false, proveedor: null };
  const p = await prisma.proveedor.findUnique({ where: { nit }, select: { nit: true, nombre: true, activo: true } });
  const existe = !!p && p.nit !== normalizeNit(excluir);
  return { nit, valido, existe, proveedor: existe ? p : null };
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
    (await prisma.record.findMany({ where: { proveedorNit: { not: null } }, select: { proveedorNit: true }, distinct: ["proveedorNit"] }))
      .map((r) => r.proveedorNit)
  );
  const alertas = await alertasPorProveedor();
  return rows.map((row) => ({ ...toClientProveedor(row, usados.has(row.nit)), alerta: alertas[row.nit] || null }));
}

export async function createProveedor(body, actor) {
  const nit = validarNitNuevo(body.nit);
  const nombre = (body.nombre || "").trim();
  const descripcion = (body.descripcion || "").trim();
  if (!nombre) throw badRequest("El nombre es obligatorio.");
  if (!descripcion) throw badRequest("La descripción es obligatoria.");
  if (await prisma.proveedor.findUnique({ where: { nit }, select: { nit: true } })) {
    throw badRequest(`Ya existe un proveedor con el NIT ${nit}.`);
  }
  const maestros = await resolverMaestros(body);
  const excepcion = await resolverExcepcion(body);
  const ahora = new Date();

  try {
    const row = await prisma.proveedor.create({
      data: {
        nit, nombre, descripcion,
        telefono: textOrNull(body.telefono), correo: textOrNull(body.correo),
        internacional: !!body.internacional,
        activo: body.activo ?? true,
        ...maestros,
        ...excepcion,
        // Quién lo registra y cuándo (createdAt): toda tabla guarda fecha de registro y responsable.
        creadoPorUserId: actor?.id || null,
        creadoPorNombre: actor?.nombre || null,
        // Se registra con su documentación al día: esa es su primera actualización, base del
        // cálculo del ciclo. Una excepción no depende de fechas.
        fechaActualizacion: excepcion.esExcepcion ? null : ahora,
        revision: opcionValida(body.revision, REVISIONES, "La revisión"),
        observacion: textOrNull(body.observacion),
      },
    });
    const proveedor = toClientProveedor(row, false);
    await logProveedorCreate(actor, proveedor).catch(() => {});
    publicarEvento("proveedor.creado", { entidadId: nit, clave: `proveedor.creado|${nit}`, datos: { nit, nombre, area: proveedor.area || null, criticidad: proveedor.criticidad || proveedor.tipo || null }, actor });
    await asegurarCicloVigente();
    await asegurarCicloDe(row);
    return proveedor;
  } catch (err) {
    if (err.code === "P2002") throw badRequest(`Ya existe un proveedor con el NIT ${nit}.`);
    throw err;
  }
}

// Corrige el NIT (llave primaria). Registros, ciclos, procesos y checklist se
// actualizan por FK ON UPDATE CASCADE; los snapshots sin FK, aquí mismo.
async function cambiarNit(tx, nitActual, nitNuevo) {
  await tx.proveedor.update({ where: { nit: nitActual }, data: { nit: nitNuevo } });
  await tx.record.updateMany({ where: { proveedorNit: nitNuevo }, data: { nit: nitNuevo } });
  await tx.calificacionProveedor.updateMany({ where: { proveedorNit: nitActual }, data: { proveedorNit: nitNuevo } });
}

export async function updateProveedor(nit, body, actor) {
  const current = await prisma.proveedor.findUnique({ where: { nit } });
  if (!current) throw notFound();

  const enUsoAntes = await isProveedorInUse(current.nit);
  const data = {};
  if (body.telefono !== undefined) data.telefono = textOrNull(body.telefono);
  if (body.correo !== undefined) data.correo = textOrNull(body.correo);
  if (body.internacional !== undefined) data.internacional = !!body.internacional;
  if (body.revision !== undefined) data.revision = opcionValida(body.revision, REVISIONES, "La revisión");
  if (body.observacion !== undefined) data.observacion = textOrNull(body.observacion);
  Object.assign(data, await resolverMaestros(body, current));
  Object.assign(data, await resolverExcepcion(body, current));

  // Estado activo/inactivo se cambia por su propio endpoint (lib/proveedoresCiclo.js#cambiarClasificacion).

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

  let nitNuevo = current.nit;
  if (body.nit !== undefined && normalizeNit(body.nit) !== current.nit) {
    nitNuevo = validarNitNuevo(body.nit);
    if (await prisma.proveedor.findUnique({ where: { nit: nitNuevo }, select: { nit: true } })) {
      throw badRequest(`Ya existe un proveedor con el NIT ${nitNuevo}.`);
    }
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      if (nitNuevo !== current.nit) await cambiarNit(tx, current.nit, nitNuevo);
      return tx.proveedor.update({ where: { nit: nitNuevo }, data });
    });
    // Al quitar la excepción el proveedor entra al ciclo vigente.
    if (current.esExcepcion && !row.esExcepcion) await asegurarCicloDe(row);
    const after = toClientProveedor(row, await isProveedorInUse(row.nit));
    await logProveedorUpdate(actor, toClientProveedor(current, enUsoAntes), after).catch(() => {});
    publicarCambiosDeProveedor(toClientProveedor(current, enUsoAntes), after, actor);
    return after;
  } catch (err) {
    if (err.code === "P2002") throw badRequest(`Ya existe un proveedor con el NIT ${nitNuevo}.`);
    throw err;
  }
}

// Dónde se usa un proveedor fuera de sus propios datos. Registros de compra (FK RESTRICT) y
// calificaciones (snapshot del NIT, sin FK) bloquean la eliminación. Su ciclo, checklist y
// procesos son datos propios del proveedor y se borran con él (ON DELETE CASCADE); la
// auditoría nunca se borra.
export async function usosDeProveedor(nit) {
  const [registros, calificaciones] = await Promise.all([
    prisma.record.count({ where: { proveedorNit: nit } }),
    prisma.calificacionProveedor.count({ where: { proveedorNit: nit } }),
  ]);
  return { registros, calificaciones };
}

function errorEnUso(usos) {
  const partes = [];
  if (usos.registros) partes.push(`${usos.registros} registro(s) de compra`);
  if (usos.calificaciones) partes.push(`${usos.calificaciones} calificación(es)`);
  const err = new Error(`No se puede eliminar: el proveedor está en uso en ${partes.join(" y ")}. Para dejar de usarlo, márcalo como inactivo.`);
  err.status = 409;
  return err;
}

export async function deleteProveedor(nit, actor) {
  const current = await prisma.proveedor.findUnique({ where: { nit }, include: { _count: { select: { ciclos: true, procesos: true } } } });
  if (!current) throw notFound();
  const usos = await usosDeProveedor(current.nit);
  if (usos.registros || usos.calificaciones) throw errorEnUso(usos);
  try {
    await prisma.proveedor.delete({ where: { nit } });
  } catch (err) {
    // Red de seguridad: si entre la validación y el borrado se creó un registro con este
    // proveedor, la FK (ON DELETE RESTRICT) lo impide.
    if (err.code === "P2003" || err.code === "P2014") throw errorEnUso(await usosDeProveedor(current.nit));
    throw err;
  }
  const { _count, ...datos } = current;
  await logProveedorDelete(actor, {
    ...toClientProveedor(datos, false),
    datosBorrados: `${_count.ciclos} ciclo(s) con su checklist y ${_count.procesos} proceso(s) histórico(s)`,
  }).catch(() => {});
  const borrado = toClientProveedor(datos, false);
  publicarEvento("proveedor.eliminado", { entidadId: borrado.nit, clave: `proveedor.eliminado|${borrado.nit}|${Date.now()}`, datos: { nit: borrado.nit, nombre: borrado.nombre, area: borrado.area || null, criticidad: borrado.criticidad || null, eliminadoPor: actor?.nombre || null }, actor });
}
