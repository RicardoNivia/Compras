import { prisma } from "@/lib/prisma";
import { logConsumo } from "@/lib/audit";
import { badRequest, notFound, limpiar, claveNombre, claveNumero, numero, fechaValida, SERVICIOS, PERIODICIDADES } from "@/lib/consumo/comun";

// Maestros de Consumo: sedes, empresas de servicio y las cuentas de cada sede (con sus medidores).
// Una sede o una cuenta con recibos no se borra: se desactiva. Un nombre que ya existe escrito de otra forma (tildes,
// mayúsculas, signos) se rechaza. El número de cuenta identifica la sede de un recibo, así que no puede repetirse
// dentro del mismo servicio.

export const TIPOS_MAESTRO = ["sede", "empresa", "cuenta"];
const ETIQUETA = { sede: "Sede", empresa: "Empresa de servicio", cuenta: "Cuenta de servicio" };
const ENTIDAD = { sede: "sedeConsumo", empresa: "empresaConsumo", cuenta: "cuentaConsumo" };
const quien = (actor) => ({ creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null });
const plano = (m) => ({ ...m, factor: Number(m.factor) });

// Todo el catálogo: las sedes con sus cuentas y medidores, las empresas y cuántos recibos o cuentas usan cada valor.
export async function catalogos() {
  const [sedes, empresas, recibosPorCuenta] = await Promise.all([
    prisma.sedeConsumo.findMany({ orderBy: [{ edificio: "asc" }, { nombre: "asc" }], include: { cuentas: { orderBy: [{ servicio: "asc" }, { id: "asc" }], include: { medidores: { orderBy: { id: "asc" } } } } } }),
    prisma.empresaConsumo.findMany({ orderBy: { nombre: "asc" } }),
    prisma.reciboConsumo.groupBy({ by: ["cuentaId"], _count: { _all: true } }),
  ]);
  const recibos = Object.fromEntries(recibosPorCuenta.map((g) => [g.cuentaId, g._count._all]));
  const usoEmpresa = {};
  const lista = sedes.map((s) => {
    const cuentas = s.cuentas.map((c) => {
      if (c.empresaId) usoEmpresa[c.empresaId] = (usoEmpresa[c.empresaId] || 0) + 1;
      return { ...c, medidores: c.medidores.map(plano), recibos: recibos[c.id] || 0 };
    });
    return { ...s, cuentas, recibos: cuentas.reduce((n, c) => n + c.recibos, 0) };
  });
  return { sedes: lista, empresas: empresas.map((e) => ({ ...e, cuentas: usoEmpresa[e.id] || 0 })), servicios: SERVICIOS, periodicidades: PERIODICIDADES };
}

// ---------- Sedes y empresas ----------

const modeloSimple = (tipo) => ({ sede: prisma.sedeConsumo, empresa: prisma.empresaConsumo })[tipo];

async function exigirNombreUnico(tipo, nombre, excluirId) {
  const k = claveNombre(nombre);
  const igual = (await modeloSimple(tipo).findMany({ select: { id: true, nombre: true } })).find((x) => claveNombre(x.nombre) === k);
  if (igual && igual.id !== excluirId) throw badRequest(`Ya existe «${igual.nombre}».`);
}

function serviciosValidos(v) {
  const lista = (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => String(s).trim()).filter(Boolean);
  const malo = lista.find((s) => !SERVICIOS[s]);
  if (malo) throw badRequest(`«${malo}» no es un servicio válido.`);
  return [...new Set(lista)].join(",");
}

function datosSimple(tipo, body, actual) {
  const data = {};
  if (body.nombre !== undefined || !actual) {
    data.nombre = limpiar(body.nombre, 120);
    if (!data.nombre) throw badRequest("El nombre es obligatorio.");
  }
  if (body.activo !== undefined) data.activo = !!body.activo;
  if (tipo === "sede") {
    for (const k of ["edificio", "direccion", "ciudad"]) if (body[k] !== undefined) data[k] = limpiar(body[k], 160);
  } else {
    if (body.nit !== undefined) data.nit = limpiar(body.nit, 30);
    if (body.servicios !== undefined) data.servicios = serviciosValidos(body.servicios);
  }
  return data;
}

const auditoriaSimple = (tipo, x) => {
  if (!x) return null;
  const base = { nombre: x.nombre, activo: x.activo ? "Sí" : "No" };
  if (tipo === "sede") return { ...base, edificio: x.edificio, direccion: x.direccion, ciudad: x.ciudad };
  return { ...base, nit: x.nit, servicios: String(x.servicios || "").split(",").filter(Boolean).map((s) => SERVICIOS[s]?.nombre || s).join(", ") || null };
};

// ---------- Cuentas de servicio y medidores ----------

const incluirCuenta = { sede: { select: { nombre: true } }, empresa: { select: { nombre: true } }, medidores: { orderBy: { id: "asc" } } };

const auditoriaCuenta = (c) => c && {
  sede: c.sede?.nombre,
  servicio: SERVICIOS[c.servicio]?.nombre || c.servicio,
  empresa: c.empresa?.nombre || null,
  numeroCuenta: c.numeroCuenta,
  titular: c.titular,
  claseUso: c.claseUso,
  estrato: c.estrato,
  periodicidad: PERIODICIDADES[c.periodicidad] || c.periodicidad,
  direccionRecibo: c.direccionRecibo,
  noAplica: c.noAplica ? "Sí" : "No",
  activo: c.activo ? "Sí" : "No",
  medidores: (c.medidores || []).map((m) => `${m.numero} (factor ${Number(m.factor)}${m.desde ? `, desde ${m.desde}` : ""}${m.hasta ? ` hasta ${m.hasta}` : ""})`).join(" · ") || null,
};

async function datosCuenta(body, actual) {
  const data = {};
  const final = (k) => (data[k] !== undefined ? data[k] : actual?.[k]);
  if (body.sedeId !== undefined || !actual) {
    const sede = await prisma.sedeConsumo.findUnique({ where: { id: Number(body.sedeId) || 0 } });
    if (!sede) throw badRequest("La sede no existe.");
    data.sedeId = sede.id;
  }
  if (body.servicio !== undefined || !actual) {
    if (!SERVICIOS[body.servicio]) throw badRequest("Elige el servicio: energía, acueducto, gas o aseo.");
    data.servicio = body.servicio;
  }
  if (body.empresaId !== undefined) {
    if (body.empresaId && !(await prisma.empresaConsumo.findUnique({ where: { id: Number(body.empresaId) } }))) throw badRequest("La empresa no existe.");
    data.empresaId = body.empresaId ? Number(body.empresaId) : null;
  }
  if (body.noAplica !== undefined) data.noAplica = !!body.noAplica;
  if (body.numeroCuenta !== undefined) data.numeroCuenta = limpiar(body.numeroCuenta, 40);
  for (const k of ["titular", "claseUso", "direccionRecibo"]) if (body[k] !== undefined) data[k] = limpiar(body[k], 200);
  if (body.estrato !== undefined) data.estrato = limpiar(body.estrato, 10);
  if (body.periodicidad !== undefined) {
    if (!PERIODICIDADES[body.periodicidad]) throw badRequest("La periodicidad debe ser mensual o bimestral.");
    data.periodicidad = body.periodicidad;
  }
  if (body.activo !== undefined) data.activo = !!body.activo;

  const [sedeId, servicio, noAplica, numeroCuenta] = [final("sedeId"), final("servicio"), final("noAplica") || false, final("numeroCuenta")];
  const otras = await prisma.cuentaConsumo.findMany({ where: { servicio, ...(actual ? { id: { not: actual.id } } : {}) }, include: { sede: { select: { nombre: true } } } });
  if (noAplica) {
    // «No aplica» = la sede no tiene ese servicio: no puede convivir con una cuenta real del mismo servicio.
    if (otras.some((o) => o.sedeId === sedeId)) throw badRequest(`Esta sede ya tiene una cuenta de ${SERVICIOS[servicio].nombre.toLowerCase()}: quítala antes de marcar «no aplica».`);
    if (actual && (await prisma.reciboConsumo.count({ where: { cuentaId: actual.id } }))) throw badRequest("Esta cuenta ya tiene recibos: no se puede marcar como «no aplica».");
    Object.assign(data, { numeroCuenta: null, empresaId: null });
  } else {
    if (!numeroCuenta) throw badRequest("Escribe el número de cuenta (o cuenta contrato) como sale en el recibo.");
    if (otras.some((o) => o.sedeId === sedeId && o.noAplica)) throw badRequest(`Esta sede está marcada sin ${SERVICIOS[servicio].nombre.toLowerCase()}: quita ese «no aplica» primero.`);
    const repetida = otras.find((o) => o.numeroCuenta && claveNumero(o.numeroCuenta) === claveNumero(numeroCuenta));
    if (repetida) throw badRequest(`La cuenta ${repetida.numeroCuenta} ya está asociada a «${repetida.sede.nombre}».`);
  }
  return data;
}

// Medidores de la cuenta: llegan todos en el arreglo; se crean los nuevos, se actualizan los que traen id y se quitan los
// que ya no vienen (salvo los que tienen recibos).
async function sincronizarMedidores(tx, actor, cuentaId, lista) {
  if (!Array.isArray(lista)) return;
  const limpios = lista.map((m) => {
    const num = limpiar(m.numero, 40);
    if (!num) throw badRequest("Cada medidor necesita su número.");
    const factor = m.factor === undefined || m.factor === null || m.factor === "" ? 1 : numero(m.factor, "El factor del medidor");
    if (!(factor > 0)) throw badRequest("El factor del medidor debe ser mayor que cero.");
    return { id: Number(m.id) || null, numero: num, factor, desde: m.desde ? fechaValida(m.desde, "La fecha «desde» del medidor") : null, hasta: m.hasta ? fechaValida(m.hasta, "La fecha «hasta» del medidor") : null };
  });
  const claves = limpios.map((m) => claveNumero(m.numero));
  if (new Set(claves).size !== claves.length) throw badRequest("Hay un medidor repetido en la cuenta.");
  const actuales = await tx.medidorConsumo.findMany({ where: { cuentaId }, include: { _count: { select: { recibos: true } } } });
  for (const viejo of actuales) {
    if (limpios.some((m) => m.id === viejo.id)) continue;
    if (viejo._count.recibos) throw badRequest(`El medidor ${viejo.numero} tiene recibos: no se puede quitar. Ponle la fecha «hasta» en que dejó de usarse.`);
    await tx.medidorConsumo.delete({ where: { id: viejo.id } });
  }
  for (const m of limpios) {
    const { id, ...datos } = m;
    if (id && actuales.some((a) => a.id === id)) await tx.medidorConsumo.update({ where: { id }, data: datos });
    else await tx.medidorConsumo.create({ data: { ...datos, cuentaId, ...quien(actor) } });
  }
}

// ---------- Crear, editar y borrar (los tres catálogos) ----------

export async function crearMaestro(actor, tipo, body) {
  if (!TIPOS_MAESTRO.includes(tipo)) throw badRequest("Catálogo inválido.");
  if (tipo === "cuenta") {
    const data = await datosCuenta(body, null);
    const fila = await prisma.$transaction(async (tx) => {
      const c = await tx.cuentaConsumo.create({ data: { ...data, ...quien(actor) } });
      await sincronizarMedidores(tx, actor, c.id, body.medidores);
      return tx.cuentaConsumo.findUnique({ where: { id: c.id }, include: incluirCuenta });
    });
    logConsumo(actor, { action: "crear", entityType: ENTIDAD.cuenta, recordId: fila.id, recordInfo: infoCuenta(fila), after: auditoriaCuenta(fila) }).catch(() => {});
    return { ...fila, medidores: fila.medidores.map(plano) };
  }
  const data = datosSimple(tipo, body, null);
  await exigirNombreUnico(tipo, data.nombre);
  const fila = await modeloSimple(tipo).create({ data: { ...data, ...quien(actor) } });
  logConsumo(actor, { action: "crear", entityType: ENTIDAD[tipo], recordId: fila.id, recordInfo: `${ETIQUETA[tipo]} «${fila.nombre}»`, after: auditoriaSimple(tipo, fila) }).catch(() => {});
  return fila;
}

const infoCuenta = (c) => `Cuenta de ${SERVICIOS[c.servicio]?.nombre.toLowerCase() || c.servicio} ${c.noAplica ? "(no aplica)" : c.numeroCuenta || ""} · ${c.sede?.nombre || ""}`.replace(/\s+/g, " ").trim();

export async function editarMaestro(actor, tipo, id, body) {
  if (!TIPOS_MAESTRO.includes(tipo)) throw badRequest("Catálogo inválido.");
  if (tipo === "cuenta") {
    const actual = await prisma.cuentaConsumo.findUnique({ where: { id: Number(id) || 0 }, include: incluirCuenta });
    if (!actual) throw notFound();
    const data = await datosCuenta(body, actual);
    if (data.servicio && data.servicio !== actual.servicio && (await prisma.reciboConsumo.count({ where: { cuentaId: actual.id } }))) throw badRequest("La cuenta ya tiene recibos: no se le puede cambiar el servicio.");
    const fila = await prisma.$transaction(async (tx) => {
      await tx.cuentaConsumo.update({ where: { id: actual.id }, data });
      await sincronizarMedidores(tx, actor, actual.id, body.medidores);
      return tx.cuentaConsumo.findUnique({ where: { id: actual.id }, include: incluirCuenta });
    });
    logConsumo(actor, { action: "editar", entityType: ENTIDAD.cuenta, recordId: fila.id, recordInfo: infoCuenta(fila), before: auditoriaCuenta(actual), after: auditoriaCuenta(fila) }).catch(() => {});
    return { ...fila, medidores: fila.medidores.map(plano) };
  }
  const actual = await modeloSimple(tipo).findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound();
  const data = datosSimple(tipo, body, actual);
  if (data.nombre) await exigirNombreUnico(tipo, data.nombre, actual.id);
  const fila = await modeloSimple(tipo).update({ where: { id: actual.id }, data });
  logConsumo(actor, { action: "editar", entityType: ENTIDAD[tipo], recordId: fila.id, recordInfo: `${ETIQUETA[tipo]} «${fila.nombre}»`, before: auditoriaSimple(tipo, actual), after: auditoriaSimple(tipo, fila) }).catch(() => {});
  return fila;
}

export async function borrarMaestro(actor, tipo, id) {
  if (!TIPOS_MAESTRO.includes(tipo)) throw badRequest("Catálogo inválido.");
  const n = Number(id) || 0;
  if (tipo === "cuenta") {
    const actual = await prisma.cuentaConsumo.findUnique({ where: { id: n }, include: incluirCuenta });
    if (!actual) throw notFound();
    const recibos = await prisma.reciboConsumo.count({ where: { cuentaId: n } });
    if (recibos) throw badRequest(`La cuenta tiene ${recibos} recibo(s): no se puede eliminar, desactívala.`);
    await prisma.cuentaConsumo.delete({ where: { id: n } });
    logConsumo(actor, { action: "eliminar", entityType: ENTIDAD.cuenta, recordId: n, recordInfo: infoCuenta(actual), before: auditoriaCuenta(actual) }).catch(() => {});
    return { ok: true };
  }
  const actual = await modeloSimple(tipo).findUnique({ where: { id: n } });
  if (!actual) throw notFound();
  if (tipo === "sede") {
    const recibos = await prisma.reciboConsumo.count({ where: { cuenta: { sedeId: n } } });
    if (recibos) throw badRequest(`«${actual.nombre}» tiene ${recibos} recibo(s): no se puede eliminar, desactívala.`);
    // Sin recibos: se va con sus cuentas (y los medidores de esas cuentas).
    await prisma.$transaction([prisma.cuentaConsumo.deleteMany({ where: { sedeId: n } }), prisma.sedeConsumo.delete({ where: { id: n } })]);
  } else {
    const cuentas = await prisma.cuentaConsumo.count({ where: { empresaId: n } });
    if (cuentas) throw badRequest(`«${actual.nombre}» factura ${cuentas} cuenta(s): no se puede eliminar, desactívala.`);
    await prisma.empresaConsumo.delete({ where: { id: n } });
  }
  logConsumo(actor, { action: "eliminar", entityType: ENTIDAD[tipo], recordId: n, recordInfo: `${ETIQUETA[tipo]} «${actual.nombre}»`, before: auditoriaSimple(tipo, actual) }).catch(() => {});
  return { ok: true };
}
