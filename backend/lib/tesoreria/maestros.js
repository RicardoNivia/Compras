import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { badRequest, notFound, limpiar, monedaValida, sinTildes } from "@/lib/tesoreria/comun";

// Catálogos de Tesorería: bancos (una pestaña de movimientos del Excel cada uno), medios de pago, ítems, conceptos y
// pagadores («Paga»). Los movimientos y los pagos los referencian por id; un valor en uso no se borra, se desactiva. Un
// nombre que ya existe escrito de otra forma (tildes, mayúsculas, espacios) se rechaza: así no vuelven los
// «Otros / otros / OTros» del Excel.

export const FORMATOS_EXTRACTO = ["avvillas", "credicorp", "generico"];
export const TIPOS_MAESTRO = ["banco", "medio", "item", "concepto", "pagador"];
const ETIQUETA = { banco: "Banco", medio: "Medio de pago", item: "Ítem", concepto: "Concepto", pagador: "Paga" };
const modelo = (tipo) => ({ banco: prisma.bancoTesoreria, medio: prisma.medioPagoTesoreria, item: prisma.itemTesoreria, concepto: prisma.conceptoTesoreria, pagador: prisma.pagadorTesoreria })[tipo];
// Campo con el que pagos programados y gastos periódicos apuntan a cada catálogo.
const CAMPO = { medio: "medioPagoId", item: "itemId", concepto: "conceptoId", pagador: "pagadorId" };

export const claveNombre = (s) => sinTildes(s).replace(/[^a-z0-9]+/g, " ").trim();

export async function catalogos({ soloActivos = false } = {}) {
  const where = soloActivos ? { activo: true } : {};
  const orden = { orderBy: { nombre: "asc" } };
  const [bancos, medios, items, conceptos, pagadores] = await Promise.all([
    prisma.bancoTesoreria.findMany({ where, ...orden }),
    prisma.medioPagoTesoreria.findMany({ where, ...orden }),
    prisma.itemTesoreria.findMany({ where, ...orden }),
    prisma.conceptoTesoreria.findMany({ where, ...orden }),
    prisma.pagadorTesoreria.findMany({ where, ...orden }),
  ]);
  return { bancos, medios, items, conceptos, pagadores };
}

// Mapas id → fila de cada catálogo (para pintar nombres vivos).
export async function mapasCatalogos() {
  const c = await catalogos();
  const m = (l) => new Map(l.map((x) => [x.id, x]));
  return { bancos: m(c.bancos), medios: m(c.medios), items: m(c.items), conceptos: m(c.conceptos), pagadores: m(c.pagadores) };
}

// Cuántos movimientos (bancos) o pagos + gastos periódicos (los demás) usan cada valor.
export async function usos() {
  const out = { banco: {}, medio: {}, item: {}, concepto: {}, pagador: {} };
  const movs = await prisma.movimientoBanco.groupBy({ by: ["bancoId"], _count: { _all: true } });
  for (const g of movs) out.banco[g.bancoId] = g._count._all;
  for (const [tipo, campo] of Object.entries(CAMPO)) {
    for (const tabla of [prisma.pagoProgramado, prisma.gastoPeriodico]) {
      const g = await tabla.groupBy({ by: [campo], _count: { _all: true } });
      for (const x of g) if (x[campo] != null) out[tipo][x[campo]] = (out[tipo][x[campo]] || 0) + x._count._all;
    }
  }
  return out;
}

export async function buscarPorNombre(tipo, nombre) {
  const k = claveNombre(nombre);
  if (!k) return null;
  const todos = await modelo(tipo).findMany();
  return todos.find((x) => claveNombre(x.nombre) === k) || null;
}

async function exigirNombreUnico(tipo, nombre, excluirId) {
  const igual = await buscarPorNombre(tipo, nombre);
  if (igual && igual.id !== excluirId) throw badRequest(`Ya existe «${igual.nombre}» en ${ETIQUETA[tipo].toLowerCase()}s.`);
}

async function datosDe(tipo, body, actual = null) {
  const data = {};
  if (body.nombre !== undefined || !actual) {
    const nombre = limpiar(body.nombre, 120);
    if (!nombre) throw badRequest("El nombre es obligatorio.");
    data.nombre = nombre;
  }
  if (body.activo !== undefined) data.activo = !!body.activo;
  if (tipo === "banco") {
    if (body.moneda !== undefined || !actual) data.moneda = monedaValida(body.moneda);
    if (body.numeroCuenta !== undefined) data.numeroCuenta = limpiar(body.numeroCuenta, 40);
    if (body.formatoExtracto !== undefined) {
      if (body.formatoExtracto && !FORMATOS_EXTRACTO.includes(body.formatoExtracto)) throw badRequest("Formato de extracto inválido.");
      data.formatoExtracto = body.formatoExtracto || null;
    }
  }
  if (tipo === "concepto" && body.itemId !== undefined) {
    if (body.itemId && !(await prisma.itemTesoreria.findUnique({ where: { id: Number(body.itemId) } }))) throw badRequest("El ítem no existe.");
    data.itemId = body.itemId ? Number(body.itemId) : null;
  }
  return data;
}

const paraAuditoria = async (tipo, x) => {
  if (!x) return null;
  const out = { tipoMaestro: ETIQUETA[tipo], nombre: x.nombre, activo: x.activo ? "Sí" : "No" };
  if (tipo === "banco") Object.assign(out, { moneda: x.moneda, numeroCuenta: x.numeroCuenta, formatoExtracto: x.formatoExtracto });
  if (tipo === "concepto") out.item = x.itemId ? (await prisma.itemTesoreria.findUnique({ where: { id: x.itemId } }))?.nombre : null;
  return out;
};

export async function crearMaestro(actor, tipo, body, { silencioso = false } = {}) {
  if (!modelo(tipo)) throw badRequest("Catálogo inválido.");
  const data = await datosDe(tipo, body);
  await exigirNombreUnico(tipo, data.nombre);
  const fila = await modelo(tipo).create({ data: { ...data, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
  if (!silencioso) logTesoreria(actor, { action: "crear", entityType: "maestroTesoreria", recordId: `${tipo}-${fila.id}`, recordInfo: `${ETIQUETA[tipo]} «${fila.nombre}»`, after: await paraAuditoria(tipo, fila) }).catch(() => {});
  return fila;
}

// El que ya existe (sin importar tildes ni mayúsculas) o uno nuevo. Lo usa la importación de la plantilla.
export async function obtenerOCrear(actor, tipo, nombre, extra = {}) {
  const limpio = limpiar(nombre, 120);
  if (!limpio) return null;
  return (await buscarPorNombre(tipo, limpio)) || crearMaestro(actor, tipo, { nombre: limpio, ...extra });
}

export async function editarMaestro(actor, tipo, id, body) {
  if (!modelo(tipo)) throw badRequest("Catálogo inválido.");
  const actual = await modelo(tipo).findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound();
  const data = await datosDe(tipo, body, actual);
  if (data.nombre) await exigirNombreUnico(tipo, data.nombre, actual.id);
  if (tipo === "banco" && data.moneda && data.moneda !== actual.moneda && (await prisma.movimientoBanco.count({ where: { bancoId: actual.id } }))) {
    throw badRequest("El banco ya tiene movimientos: no se le puede cambiar la moneda.");
  }
  const fila = await modelo(tipo).update({ where: { id: actual.id }, data });
  // El nombre del concepto también vive como texto en el pago: se actualiza para que no quede el viejo.
  if (tipo === "concepto" && data.nombre && data.nombre !== actual.nombre) {
    await prisma.pagoProgramado.updateMany({ where: { conceptoId: actual.id }, data: { concepto: data.nombre } });
  }
  logTesoreria(actor, { action: "editar", entityType: "maestroTesoreria", recordId: `${tipo}-${fila.id}`, recordInfo: `${ETIQUETA[tipo]} «${fila.nombre}»`, before: await paraAuditoria(tipo, actual), after: await paraAuditoria(tipo, fila) }).catch(() => {});
  return fila;
}

export async function borrarMaestro(actor, tipo, id) {
  if (!modelo(tipo)) throw badRequest("Catálogo inválido.");
  const actual = await modelo(tipo).findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound();
  const n = (await usos())[tipo][actual.id] || 0;
  if (n) throw badRequest(`«${actual.nombre}» está en uso (${n}): no se puede borrar, desactívalo.`);
  await modelo(tipo).delete({ where: { id: actual.id } });
  logTesoreria(actor, { action: "eliminar", entityType: "maestroTesoreria", recordId: `${tipo}-${actual.id}`, recordInfo: `${ETIQUETA[tipo]} «${actual.nombre}»`, before: await paraAuditoria(tipo, actual) }).catch(() => {});
  return { ok: true };
}
