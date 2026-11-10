import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { badRequest, notFound, limpiar, numero, fechaValida, monedaValida, sinTildes } from "@/lib/tesoreria/comun";

// Catálogos de Tesorería: cuentas (medios de pago, con su moneda ISO 4217), ítems, conceptos y pagadores. Los
// movimientos los referencian por id; un valor en uso no se borra, se desactiva. Un nombre que ya existe escrito de otra
// forma (tildes, mayúsculas, espacios) se rechaza: así no vuelven los «Otros / otros / OTros» del Excel.

export const TIPOS_CUENTA = ["ahorros", "inversion", "tarjeta", "efectivo", "otro"];
export const FORMATOS_EXTRACTO = ["avvillas", "credicorp", "generico"];
const ETIQUETA = { cuenta: "Cuenta", item: "Ítem", concepto: "Concepto", pagador: "Paga" };
const modelo = (tipo) => ({ cuenta: prisma.cuentaTesoreria, item: prisma.itemTesoreria, concepto: prisma.conceptoTesoreria, pagador: prisma.pagadorTesoreria })[tipo];
const CAMPO_MOV = { cuenta: "cuentaId", item: "itemId", concepto: "conceptoId", pagador: "pagadorId" };

const num = (d) => (d == null ? null : Number(d));

export const toClientCuenta = (c) => ({ ...c, saldoInicial: num(c.saldoInicial) });

export async function catalogos({ soloActivos = false } = {}) {
  const where = soloActivos ? { activo: true } : {};
  const [cuentas, items, conceptos, pagadores] = await Promise.all([
    prisma.cuentaTesoreria.findMany({ where, orderBy: { nombre: "asc" } }),
    prisma.itemTesoreria.findMany({ where, orderBy: { nombre: "asc" } }),
    prisma.conceptoTesoreria.findMany({ where, orderBy: { nombre: "asc" } }),
    prisma.pagadorTesoreria.findMany({ where, orderBy: { nombre: "asc" } }),
  ]);
  return { cuentas: cuentas.map(toClientCuenta), items, conceptos, pagadores };
}

// Cuántos movimientos usan cada valor (para saber si se puede borrar).
export async function usos() {
  const out = {};
  for (const [tipo, campo] of Object.entries(CAMPO_MOV)) {
    const g = await prisma.movimientoTesoreria.groupBy({ by: [campo], _count: { _all: true } });
    out[tipo] = Object.fromEntries(g.filter((x) => x[campo] != null).map((x) => [x[campo], x._count._all]));
  }
  const destino = await prisma.movimientoTesoreria.groupBy({ by: ["cuentaDestinoId"], _count: { _all: true } });
  for (const d of destino) if (d.cuentaDestinoId != null) out.cuenta[d.cuentaDestinoId] = (out.cuenta[d.cuentaDestinoId] || 0) + d._count._all;
  return out;
}

async function exigirNombreUnico(tipo, nombre, excluirId) {
  const todos = await modelo(tipo).findMany({ select: { id: true, nombre: true } });
  const igual = todos.find((x) => x.id !== excluirId && sinTildes(x.nombre).replace(/\s+/g, " ") === sinTildes(nombre).replace(/\s+/g, " "));
  if (igual) throw badRequest(`Ya existe «${igual.nombre}» en ${ETIQUETA[tipo].toLowerCase()}s.`);
}

async function datosDe(tipo, body, actual = null) {
  const data = {};
  if (body.nombre !== undefined || !actual) {
    const nombre = limpiar(body.nombre, 120);
    if (!nombre) throw badRequest("El nombre es obligatorio.");
    data.nombre = nombre;
  }
  if (body.activo !== undefined) data.activo = !!body.activo;
  if (tipo === "cuenta") {
    if (body.tipo !== undefined) {
      if (!TIPOS_CUENTA.includes(body.tipo)) throw badRequest(`Tipo de cuenta inválido: ${TIPOS_CUENTA.join(", ")}.`);
      data.tipo = body.tipo;
    }
    if (body.moneda !== undefined || !actual) data.moneda = monedaValida(body.moneda);
    if (body.formatoExtracto !== undefined) {
      if (body.formatoExtracto && !FORMATOS_EXTRACTO.includes(body.formatoExtracto)) throw badRequest("Formato de extracto inválido.");
      data.formatoExtracto = body.formatoExtracto || null;
    }
    if (body.saldoInicial !== undefined) data.saldoInicial = numero(body.saldoInicial || 0, "El saldo inicial");
    if (body.saldoInicialFecha !== undefined) data.saldoInicialFecha = body.saldoInicialFecha ? fechaValida(body.saldoInicialFecha, "La fecha del saldo inicial") : null;
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
  if (tipo === "cuenta") Object.assign(out, { tipo: x.tipo, moneda: x.moneda, formatoExtracto: x.formatoExtracto, saldoInicial: num(x.saldoInicial), saldoInicialFecha: x.saldoInicialFecha });
  if (tipo === "concepto") out.item = x.itemId ? (await prisma.itemTesoreria.findUnique({ where: { id: x.itemId } }))?.nombre : null;
  return out;
};

export async function crearMaestro(actor, tipo, body) {
  if (!modelo(tipo)) throw badRequest("Catálogo inválido.");
  const data = await datosDe(tipo, body);
  await exigirNombreUnico(tipo, data.nombre);
  const fila = await modelo(tipo).create({ data: { ...data, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  logTesoreria(actor, { action: "crear", entityType: "maestroTesoreria", recordId: `${tipo}-${fila.id}`, recordInfo: `${ETIQUETA[tipo]} «${fila.nombre}»`, after: await paraAuditoria(tipo, fila) }).catch(() => {});
  return tipo === "cuenta" ? toClientCuenta(fila) : fila;
}

export async function editarMaestro(actor, tipo, id, body) {
  if (!modelo(tipo)) throw badRequest("Catálogo inválido.");
  const actual = await modelo(tipo).findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound();
  const data = await datosDe(tipo, body, actual);
  if (data.nombre) await exigirNombreUnico(tipo, data.nombre, actual.id);
  if (tipo === "cuenta" && data.moneda && data.moneda !== actual.moneda && (await prisma.movimientoTesoreria.count({ where: { cuentaId: actual.id } }))) {
    throw badRequest("La cuenta ya tiene movimientos: no se le puede cambiar la moneda.");
  }
  const fila = await modelo(tipo).update({ where: { id: actual.id }, data });
  // El nombre del concepto también vive como texto en el movimiento: se actualiza para que no quede el viejo.
  if (tipo === "concepto" && data.nombre && data.nombre !== actual.nombre) {
    await prisma.movimientoTesoreria.updateMany({ where: { conceptoId: actual.id }, data: { concepto: data.nombre } });
  }
  logTesoreria(actor, { action: "editar", entityType: "maestroTesoreria", recordId: `${tipo}-${fila.id}`, recordInfo: `${ETIQUETA[tipo]} «${fila.nombre}»`, before: await paraAuditoria(tipo, actual), after: await paraAuditoria(tipo, fila) }).catch(() => {});
  return tipo === "cuenta" ? toClientCuenta(fila) : fila;
}

export async function borrarMaestro(actor, tipo, id) {
  if (!modelo(tipo)) throw badRequest("Catálogo inválido.");
  const actual = await modelo(tipo).findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound();
  const n = (await usos())[tipo][actual.id] || 0;
  if (n) throw badRequest(`«${actual.nombre}» está en ${n} movimiento(s): no se puede borrar, desactívalo.`);
  if (tipo === "cuenta" && (await prisma.lineaExtracto.count({ where: { cuentaId: actual.id } }))) throw badRequest("La cuenta tiene extractos cargados: desactívala en lugar de borrarla.");
  await modelo(tipo).delete({ where: { id: actual.id } });
  logTesoreria(actor, { action: "eliminar", entityType: "maestroTesoreria", recordId: `${tipo}-${actual.id}`, recordInfo: `${ETIQUETA[tipo]} «${actual.nombre}»`, before: await paraAuditoria(tipo, actual) }).catch(() => {});
  return { ok: true };
}
