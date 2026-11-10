import { prisma } from "@/lib/prisma";
import { logCreate, logUpdate, logDelete } from "@/lib/audit";
import { publicarCambiosDeCompra, revisarUmbralPresupuesto, publicarEvento, datosCompra } from "@/lib/notificacionesEventos";

// Campos de Record respaldados por un Maestro genérico (area/estado/
// categoria/medioPago/estadoLegalizacion) — a diferencia de proveedor
// (modelo propio, Proveedor.id) y responsable (User.id), la referencia
// real acá es el id de la fila en Maestro. idField guarda esa referencia;
// textField es el snapshot de texto (se reemplaza por el valor ACTUAL del
// maestro al listar, ver hydrateConDatosActuales). "required" solo aplica a
// "area" — los demás son opcionales, igual que antes de este cambio.
const MAESTRO_CAMPOS = [
  { tipo: "area", idField: "areaId", textField: "area", required: true, label: "área" },
  { tipo: "estado", idField: "estadoId", textField: "estado", required: false, label: "estado de la compra" },
  { tipo: "categoria", idField: "categoriaId", textField: "categoria", required: false, label: "categoría" },
  { tipo: "medioPago", idField: "medioPagoId", textField: "medioPago", required: false, label: "medio de pago" },
  { tipo: "estadoLegalizacion", idField: "estadoLegalizacionId", textField: "estadoLegalizacion", required: false, label: "estado de legalización" },
];

// Mapea un registro de Prisma al shape que usa el front. "actual" (opcional)
// trae el proveedor/usuario/maestros YA resueltos (ver hydrateConDatosActuales)
// para mostrar su nombre ACTUAL en vez del texto guardado en el momento de la
// compra — así, si luego se corrige un nombre en un catálogo, el cambio se ve
// reflejado en los registros ya existentes sin tener que reeditarlos uno por
// uno. Si la referencia no resuelve (dato histórico sin el *Id, o la fila del
// catálogo fue eliminada), se cae al texto guardado tal cual — nunca se
// pierde el dato.
export function toClientRecord(r, actual = {}) {
  return {
    id: r.id,
    localSeq: r.localSeq,
    informe: r.informe,
    fechaSolicitud: r.fechaSolicitud,
    fechaEntrega: r.fechaEntrega,
    area: actual.area ?? r.area,
    areaId: r.areaId,
    responsable: actual.responsableNombre ?? r.responsable,
    responsableUserId: r.responsableUserId,
    estado: actual.estado ?? r.estado,
    estadoId: r.estadoId,
    categoria: actual.categoria ?? r.categoria,
    categoriaId: r.categoriaId,
    descripcion: r.descripcion,
    medioPago: actual.medioPago ?? r.medioPago,
    medioPagoId: r.medioPagoId,
    licitacion: r.licitacion,
    estadoLegalizacion: actual.estadoLegalizacion ?? r.estadoLegalizacion,
    estadoLegalizacionId: r.estadoLegalizacionId,
    nit: actual.proveedorNit ?? r.nit,
    proveedor: actual.proveedorNombre ?? r.proveedor,
    proveedorNit: r.proveedorNit,
    fe: r.fe,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    valorCot: r.valorCot,
    moneda: r.moneda || "COP",
    valorUsd: r.valorUsd,
    trm: r.trm,
    observaciones: r.observaciones,
    radicado: r.radicado,
    // Capturada por el servidor al crear el registro (Prisma @default(now()),
    // nunca editable desde el cliente — ver FIELD_SANITIZERS, que no la
    // incluye) — distinta de "fechaSolicitud", que el usuario puede editar o
    // dejar con una fecha pasada.
    fechaRegistro: r.createdAt,
    // Resumen de la calificación del proveedor para este registro (ver
    // lib/calificaciones.js) — null si todavía no se ha calificado. Solo las
    // estrellas, no el detalle de causas (eso se pide aparte, GET
    // /api/records/[id]/calificacion, cuando se abre el modal de calificar).
    calificacion: actual.calificacionEstrellas != null ? { estrellas: actual.calificacionEstrellas } : null,
    // Valoración con IA de la compra radicada (solo los puntajes; el detalle se pide aparte, GET
    // /api/records/[id]/valoracion) — null si todavía no se valoró.
    valoracion: actual.valoracion ?? null,
    // Actividad de Bienestar a la que se carga la compra (ver lib/actividadesBienestar.js): referencia por id, el
    // nombre guardado es solo una foto y al listar se muestra el actual.
    actividadId: r.actividadId ?? null,
    actividad: actual.actividad ?? r.actividad ?? null,
  };
}

// Resuelve, para un lote de registros, el valor ACTUAL de cada referencia
// (proveedor por código, usuario responsable por id, y los 5 maestros
// genéricos por id) — pocas consultas IN en vez de N+1. Úsalo antes de
// mapear con toClientRecord cuando el resultado se le muestra al usuario
// (listar, crear, editar); los snapshots "before"/"after" de auditoría NO lo
// usan a propósito, para que el historial quede con el dato tal como era en
// ese momento.
async function hydrateConDatosActuales(rows) {
  const proveedorNits = [...new Set(rows.map((r) => r.proveedorNit).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.responsableUserId).filter(Boolean))];
  const maestroIds = [...new Set(
    rows.flatMap((r) => MAESTRO_CAMPOS.map((c) => r[c.idField])).filter(Boolean)
  )];
  const recordIds = rows.map((r) => r.id);
  const actividadIds = [...new Set(rows.map((r) => r.actividadId).filter(Boolean))];
  const [proveedores, usuarios, maestros, calificaciones, valoraciones, actividades] = await Promise.all([
    proveedorNits.length ? prisma.proveedor.findMany({ where: { nit: { in: proveedorNits } } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } } }) : [],
    maestroIds.length ? prisma.maestro.findMany({ where: { id: { in: maestroIds } } }) : [],
    recordIds.length ? prisma.calificacionProveedor.findMany({ where: { recordId: { in: recordIds } }, select: { recordId: true, estrellas: true } }) : [],
    recordIds.length ? prisma.valoracionCompra.findMany({ where: { recordId: { in: recordIds } }, select: { recordId: true, puntajeCompra: true, puntajeProveedor: true } }) : [],
    actividadIds.length ? prisma.actividadBienestar.findMany({ where: { id: { in: actividadIds } }, select: { id: true, nombre: true } }) : [],
  ]);
  const actividadPorId = new Map(actividades.map((a) => [a.id, a.nombre]));
  const valoracionPorRecordId = new Map(valoraciones.map((v) => [v.recordId, { puntajeCompra: v.puntajeCompra, puntajeProveedor: v.puntajeProveedor }]));
  const proveedorPorNit = new Map(proveedores.map((p) => [p.nit, p]));
  const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
  const maestroPorId = new Map(maestros.map((m) => [m.id, m]));
  const calificacionPorRecordId = new Map(calificaciones.map((c) => [c.recordId, c.estrellas]));
  return rows.map((r) => {
    const p = r.proveedorNit ? proveedorPorNit.get(r.proveedorNit) : null;
    const u = r.responsableUserId ? usuarioPorId.get(r.responsableUserId) : null;
    const actual = {
      proveedorNombre: p?.nombre,
      proveedorNit: p?.nit,
      responsableNombre: u?.nombre,
      calificacionEstrellas: calificacionPorRecordId.get(r.id),
      valoracion: valoracionPorRecordId.get(r.id),
      actividad: r.actividadId ? actividadPorId.get(r.actividadId) : undefined,
    };
    for (const campo of MAESTRO_CAMPOS) {
      const m = r[campo.idField] ? maestroPorId.get(r[campo.idField]) : null;
      if (m && m.activo) actual[campo.textField] = m.valor;
    }
    return toClientRecord(r, actual);
  });
}

export async function listRecords() {
  const rows = await prisma.record.findMany({ orderBy: { fechaSolicitud: "asc" } });
  return hydrateConDatosActuales(rows);
}

export async function getMeta() {
  const meta = await prisma.meta.findUnique({ where: { id: 1 } });
  return {
    sourceFile: meta?.sourceFile ?? null,
    sourceSheet: meta?.sourceSheet ?? null,
    nextLocalSeq: meta?.nextLocalSeq ?? 1,
    updatedAt: meta?.updatedAt ?? null,
  };
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Tope de tamaño para campos de texto libre — evita que un payload gigante
// (abuso de almacenamiento, por error o intencional) se guarde tal cual; no
// es una medida contra inyección (Prisma ya parametriza las queries).
function textOrNull(maxLength) {
  return (v) => {
    if (!v) return null;
    const s = String(v);
    return s.length > maxLength ? s.slice(0, maxLength) : s;
  };
}

const FIELD_SANITIZERS = {
  informe: textOrNull(100),
  fechaSolicitud: (v) => v || null,
  fechaEntrega: (v) => v || null,
  area: textOrNull(100),
  areaId: textOrNull(40),
  responsable: textOrNull(150),
  responsableUserId: textOrNull(40),
  estado: textOrNull(100),
  estadoId: textOrNull(40),
  categoria: textOrNull(100),
  categoriaId: textOrNull(40),
  descripcion: textOrNull(2000),
  medioPago: textOrNull(100),
  medioPagoId: textOrNull(40),
  licitacion: textOrNull(100),
  estadoLegalizacion: textOrNull(100),
  estadoLegalizacionId: textOrNull(40),
  // Sin dígito de verificación (se valida/normaliza en el formulario, no aquí).
  nit: textOrNull(20),
  proveedor: textOrNull(200),
  proveedorNit: textOrNull(40),
  fe: textOrNull(100),
  valorConIva: numOrNull,
  valorSinIva: numOrNull,
  valorCot: numOrNull,
  moneda: (v) => (v === "USD" ? "USD" : "COP"),
  valorUsd: numOrNull,
  trm: numOrNull,
  observaciones: textOrNull(4000),
  radicado: (v) => !!v,
  actividadId: (v) => (v === "" || v === null || v === undefined || !Number.isInteger(Number(v)) ? null : Number(v)),
};

export function sanitizeInput(body) {
  const out = {};
  for (const key of Object.keys(FIELD_SANITIZERS)) {
    out[key] = FIELD_SANITIZERS[key](body[key]);
  }
  return out;
}

// Igual que sanitizeInput, pero solo para el subconjunto de campos dado —
// usado cuando el rol (p.ej. legalizar) solo puede tocar ciertos campos.
export function sanitizeFields(body, fields) {
  const out = {};
  for (const key of fields) {
    if (key in FIELD_SANITIZERS) out[key] = FIELD_SANITIZERS[key](body[key]);
  }
  return out;
}

// El número de factura/referencia (fe) puede repetirse (p.ej. una misma
// factura cubre varias compras): esto NUNCA bloquea el guardado, solo se usa
// para devolver un aviso informativo al cliente (ver "feWarning" abajo).
async function countOtrosConFe(fe, excludeId) {
  if (!fe) return 0;
  return prisma.record.count({ where: { fe, id: excludeId ? { not: excludeId } : undefined } });
}

// El proveedor es OPCIONAL al guardar un registro. Si se envía, debe ser un
// proveedor activo del catálogo (nunca texto libre); si no, el registro queda
// sin proveedor (proveedorNit, nit y proveedor en null) — ver createRecord.
// La referencia real es el NIT del proveedor (Record.proveedorNit, FK a Proveedor.nit); nit/proveedor
// quedan como snapshot de texto (se reemplazan por el valor actual al listar,
// ver hydrateConDatosActuales) — así un desfase de mayúsculas/espacios, o un
// nit que todavía sea un placeholder "PENDIENTE-...", no generan inconsistencias.
async function requireProveedorDelCatalogo(data) {
  if (!data.proveedorNit) {
    const err = new Error("Selecciona un proveedor del catálogo. Si no existe, pide a un administrador que lo agregue en Maestros → Proveedores.");
    err.status = 400;
    throw err;
  }
  const proveedor = await prisma.proveedor.findUnique({ where: { nit: data.proveedorNit } });
  if (!proveedor || !proveedor.activo) {
    const err = new Error("El proveedor seleccionado no existe o está inactivo en el catálogo. Pide a un administrador que lo agregue o reactive en Maestros → Proveedores.");
    err.status = 400;
    throw err;
  }
  data.nit = proveedor.nit;
  data.proveedor = proveedor.nombre;
  return proveedor;
}

// La actividad de Bienestar es opcional. Si viene, debe existir en el cronograma (nunca texto libre): el nombre
// guardado se recalcula del catálogo, igual que el proveedor. Una actividad cerrada no recibe compras nuevas,
// pero una compra que ya estaba en ella puede seguir ahí.
async function requireActividadDelCatalogo(data, actualId = null) {
  // Una compra no se saca de una actividad cerrada.
  if (actualId && Number(data.actividadId) !== Number(actualId)) {
    const actual = await prisma.actividadBienestar.findUnique({ where: { id: Number(actualId) }, select: { estado: true } });
    if (actual?.estado === "cerrada") {
      const err = new Error("La compra está asociada a una actividad cerrada: no se puede cambiar de actividad.");
      err.status = 409;
      throw err;
    }
  }
  if (!data.actividadId) {
    data.actividadId = null;
    data.actividad = null;
    return null;
  }
  const actividad = await prisma.actividadBienestar.findUnique({ where: { id: data.actividadId }, select: { id: true, nombre: true, estado: true } });
  if (!actividad || (actividad.estado === "cerrada" && actividad.id !== actualId)) {
    const err = new Error("La actividad de Bienestar seleccionada no existe o ya está cerrada. Elige otra del cronograma.");
    err.status = 400;
    throw err;
  }
  data.actividad = actividad.nombre;
  return actividad;
}

// El responsable debe ser siempre un usuario real de la app, nunca texto
// libre (ver lib/maestros.js#resolveResponsableUser) — a diferencia de
// proveedor, esto se exige tanto al crear COMO al editar, porque los ~800
// registros históricos ya quedaron migrados a un responsableUserId válido
// (ver prisma/scripts de migración), así que no hay vacío que proteger.
async function requireResponsableDelCatalogo(data) {
  if (!data.responsableUserId) {
    const err = new Error("Selecciona un responsable de la lista (debe ser un usuario de la aplicación). Si no aparece, pide a un administrador que lo agregue en Maestros → Responsable.");
    err.status = 400;
    throw err;
  }
  const maestro = await prisma.maestro.findFirst({ where: { tipo: "responsable", userId: data.responsableUserId, activo: true } });
  if (!maestro) {
    const err = new Error("El responsable seleccionado no existe o está inactivo en Maestros → Responsable.");
    err.status = 400;
    throw err;
  }
  data.responsable = maestro.valor;
  return maestro;
}

// Valida un campo respaldado por un Maestro genérico (ver MAESTRO_CAMPOS):
// si trae id, debe existir, ser del tipo correcto y estar activo — nunca se
// acepta el texto que mande el cliente, siempre se recalcula desde el
// catálogo. Se exige tanto al crear como al editar (igual que responsable):
// el backfill dejó prácticamente el 100% de los registros ya atados a un id
// real, así que no hay vacío histórico que proteger (a diferencia de
// proveedor). Si el campo no es obligatorio y no trae id, simplemente lo
// deja vacío (permite "quitar" la categoría, por ejemplo).
async function requireMaestroCampo(campo, data) {
  const id = data[campo.idField];
  if (!id) {
    if (campo.required) {
      const err = new Error(`Selecciona ${campo.tipo === "area" ? "un" : "un"} ${campo.label} del catálogo.`);
      err.status = 400;
      throw err;
    }
    data[campo.textField] = null;
    return;
  }
  const maestro = await prisma.maestro.findUnique({ where: { id } });
  if (!maestro || maestro.tipo !== campo.tipo || !maestro.activo) {
    const err = new Error(`El valor de ${campo.label} no existe o está inactivo en el catálogo. Pide a un administrador que lo agregue o reactive en Maestros.`);
    err.status = 400;
    throw err;
  }
  data[campo.textField] = maestro.valor;
}

export async function createRecord(body, actor) {
  const data = sanitizeInput(body);
  if (!data.fechaSolicitud || !data.responsableUserId || !data.descripcion) {
    const err = new Error("Completa fecha de solicitud, responsable y descripción.");
    err.status = 400;
    throw err;
  }
  for (const campo of MAESTRO_CAMPOS) {
    await requireMaestroCampo(campo, data);
  }
  // Proveedor opcional: si viene se valida contra el catálogo; si no, queda vacío (sin texto libre).
  let proveedor = null;
  if (data.proveedorNit) proveedor = await requireProveedorDelCatalogo(data);
  else Object.assign(data, { proveedorNit: null, nit: null, proveedor: null });
  await requireActividadDelCatalogo(data);
  const maestroResponsable = await requireResponsableDelCatalogo(data);
  const feDuplicados = await countOtrosConFe(data.fe, null);
  // Asigna el siguiente número autoincremental visible (localSeq) desde Meta,
  // en la misma transacción para evitar que dos creaciones simultáneas choquen.
  const row = await prisma.$transaction(async (tx) => {
    const meta = await tx.meta.findUnique({ where: { id: 1 } });
    const seq = meta?.nextLocalSeq ?? 1;
    await tx.meta.upsert({
      where: { id: 1 },
      update: { nextLocalSeq: seq + 1 },
      create: { id: 1, nextLocalSeq: seq + 1 },
    });
    return tx.record.create({ data: { ...data, localSeq: seq } });
  });
  const record = toClientRecord(row, { proveedorNombre: proveedor?.nombre, proveedorNit: proveedor?.nit, responsableNombre: maestroResponsable.valor });
  await logCreate(actor, record).catch(() => {});
  // Notificaciones por evento (fire-and-forget: nunca bloquea ni hace fallar el guardado).
  publicarCambiosDeCompra(null, record, actor);
  revisarUmbralPresupuesto(record.area, record.categoria);
  if (feDuplicados > 0) {
    record.feWarning = `Ya existen ${feDuplicados} compra(s) registradas con el número de factura/referencia "${data.fe}".`;
  }
  return record;
}

// options.fields restringe qué campos puede tocar esta edición (p.ej. legalizar);
// omitirlo sanea el registro completo (admin, registro).
export async function updateRecord(id, body, actor, options = {}) {
  const before = await prisma.record.findUnique({ where: { id } });
  const data = options.fields ? sanitizeFields(body, options.fields) : sanitizeInput(body);
  if ("responsableUserId" in data) {
    await requireResponsableDelCatalogo(data);
  }
  // Si cambia el proveedor, el NIT debe existir en el catálogo (FK a Proveedor.nit);
  // el snapshot nit/nombre se recalcula del catálogo. Mantener el mismo proveedor
  // aunque hoy esté inactivo no se bloquea.
  if (data.proveedorNit && data.proveedorNit !== before?.proveedorNit) {
    await requireProveedorDelCatalogo(data);
  } else if (data.proveedorNit) {
    const p = await prisma.proveedor.findUnique({ where: { nit: data.proveedorNit } });
    if (p) { data.nit = p.nit; data.proveedor = p.nombre; }
  }
  for (const campo of MAESTRO_CAMPOS) {
    if (campo.idField in data) await requireMaestroCampo(campo, data);
  }
  if ("actividadId" in data) await requireActividadDelCatalogo(data, before?.actividadId ?? null);
  const feDuplicados = "fe" in data ? await countOtrosConFe(data.fe, id) : 0;
  const row = await prisma.record.update({ where: { id }, data });
  const [after] = await hydrateConDatosActuales([row]);
  await logUpdate(actor, before ? toClientRecord(before) : null, after, "editar").catch(() => {});
  publicarCambiosDeCompra(before ? toClientRecord(before) : null, after, actor);
  if (before && (before.valorConIva !== after.valorConIva || before.areaId !== after.areaId || before.categoriaId !== after.categoriaId || before.fechaSolicitud !== after.fechaSolicitud)) revisarUmbralPresupuesto(after.area, after.categoria);
  if (feDuplicados > 0) {
    after.feWarning = `Ya existen ${feDuplicados} compra(s) registradas con el número de factura/referencia "${data.fe}".`;
  }
  return after;
}

export async function patchRecord(id, rawPartial, actor, options = {}) {
  const before = await prisma.record.findUnique({ where: { id } });
  const partial = options.fields
    ? Object.fromEntries(Object.entries(rawPartial).filter(([k]) => options.fields.includes(k)))
    : rawPartial;
  // El radicado es una acción de un solo sentido: una vez marcado, nadie
  // (ni admin) puede desmarcarlo — se refuerza aquí, no solo en la UI.
  if (before?.radicado && partial.radicado === false) {
    const err = new Error("No se puede desmarcar el radicado: una vez marcado no se puede deshacer.");
    err.status = 409;
    throw err;
  }
  // Solo se puede radicar un registro cuya legalización ya esté en estado "Legalizado".
  if (partial.radicado === true) {
    const estadoLegalizacion = partial.estadoLegalizacion !== undefined ? partial.estadoLegalizacion : before?.estadoLegalizacion;
    if (estadoLegalizacion !== "Legalizado") {
      const err = new Error("Solo se puede radicar un registro con estado de legalización \"Legalizado\".");
      err.status = 409;
      throw err;
    }
  }
  const row = await prisma.record.update({ where: { id }, data: partial });
  const [after] = await hydrateConDatosActuales([row]);
  const action = Object.keys(partial).every((k) => k === "radicado") ? "radicar" : "editar";
  await logUpdate(actor, before ? toClientRecord(before) : null, after, action).catch(() => {});
  publicarCambiosDeCompra(before ? toClientRecord(before) : null, after, actor);
  return after;
}

export async function deleteRecord(id, actor) {
  const before = await prisma.record.findUnique({ where: { id } });
  await prisma.record.delete({ where: { id } });
  if (before) {
    const r = toClientRecord(before);
    await logDelete(actor, r).catch(() => {});
    // Notificaciones por evento: la compra ya no existe, así que el evento lleva sus datos tal como estaban.
    publicarEvento("compra.eliminada", { entidadId: id, clave: `compra.eliminada|${id}`, datos: { ...datosCompra(r), eliminadaPor: actor?.nombre || null }, actor });
  }
}

// Asocia (o desasocia, con actividadId null) una compra a una actividad de Bienestar desde el módulo de Bienestar
// (requiere editBienestar, no editRecord): solo toca actividadId/actividad, con las mismas validaciones que el
// formulario de compras, y queda en la auditoría de la compra.
export async function asignarActividadACompra(recordId, actividadId, actor) {
  const before = await prisma.record.findUnique({ where: { id: String(recordId) } });
  if (!before) {
    const err = new Error("Compra no encontrada.");
    err.status = 404;
    throw err;
  }
  const data = { actividadId: actividadId ? Number(actividadId) : null };
  await requireActividadDelCatalogo(data, before.actividadId);
  const row = await prisma.record.update({ where: { id: before.id }, data });
  const [after] = await hydrateConDatosActuales([row]);
  await logUpdate(actor, toClientRecord(before), after, "editar").catch(() => {});
  publicarCambiosDeCompra(toClientRecord(before), after, actor);
  return after;
}

// Compras que aún no tienen actividad, para asociarlas desde Bienestar: búsqueda por número, descripción o
// proveedor; las más recientes primero.
export async function comprasSinActividad({ q = "", limite = 20 } = {}) {
  const texto = String(q).trim();
  const numero = Number(texto.replace(/^#/, ""));
  const where = { actividadId: null };
  if (texto) {
    where.OR = [
      { descripcion: { contains: texto, mode: "insensitive" } },
      { proveedor: { contains: texto, mode: "insensitive" } },
      { area: { contains: texto, mode: "insensitive" } },
      ...(Number.isInteger(numero) && numero > 0 ? [{ localSeq: numero }] : []),
    ];
  }
  const rows = await prisma.record.findMany({
    where,
    orderBy: [{ fechaSolicitud: "desc" }, { localSeq: "desc" }],
    take: Math.min(300, Number(limite) || 20),
    select: { id: true, localSeq: true, fechaSolicitud: true, descripcion: true, proveedor: true, area: true, valorConIva: true, estadoLegalizacion: true },
  });
  return rows;
}
