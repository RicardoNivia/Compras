import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { revisarArchivoImportacion } from "@/lib/archivoSeguro";
import { catalogos, claveNombre, crearMaestro } from "@/lib/tesoreria/maestros";
import { crearGasto } from "@/lib/tesoreria/periodicos";
import { crearAlertas } from "@/lib/tesoreria/alertas";
import { badRequest, fmtMoneda, fechaDe, sumarDias, limpiar, TIPOS_PAGO, PERIODICIDADES } from "@/lib/tesoreria/comun";
import { analizarLibro, leerBanco, leerPagos, clavesMovimientos, clavesPagos, inferirPeriodicos, claveGrupo, bancoSugerido, norm } from "@/lib/tesoreria/plantillaExcel";

// Subir la plantilla de Excel (el mismo «Flujo de Caja» que se maneja hoy). Dos pasos:
//   1. analizar: qué pestañas parecen de banco y cuáles de pagos programados, cuántas filas son nuevas, qué saldos y
//      ceros trae y qué gastos periódicos se proponen. No escribe nada.
//   2. aplicar: con lo que la persona confirmó (qué pestañas son de banco y a qué banco van, qué pestañas de pagos se
//      cargan y qué gastos periódicos se crean con su periodicidad y día de corte).
// Volver a subirla no duplica: cada fila tiene su huella (claveImportacion). Un pago que en el Excel nuevo pasó de P a
// E (o cambió de valor) se actualiza si en la app seguía pendiente y sin movimientos. Las filas S (saldos de enero) no
// se cargan como pagos: quedan como alerta para registrarlas en Saldos iniciales. Lo que no cuadra va a Mi día.

const ORIGEN = { id: null, nombre: "Importación Excel" };
const quien = (actor) => actor || ORIGEN;

function prepararArchivo(buffer, nombre) {
  if (!/\.(xlsx|xls)$/i.test(nombre || "")) throw badRequest("Sube la plantilla en Excel (.xlsx o .xls).");
  revisarArchivoImportacion(buffer, nombre); // sin macros, objetos ni fórmulas peligrosas
  return analizarLibro(buffer);
}

const anioMasComun = (lista) => {
  const c = {};
  for (const x of lista) c[x.anio] = (c[x.anio] || 0) + 1;
  return Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]) || null;
};

export async function analizarPlantilla(buffer, nombre) {
  const hojas = prepararArchivo(buffer, nombre);
  const cat = await catalogos();
  const bancoPorClave = new Map(cat.bancos.map((b) => [claveNombre(b.nombre), b]));
  const out = [];
  // Pestaña de pagos más grande de cada año: es la que se preselecciona (las otras suelen ser vistas de los mismos pagos).
  const mayorPorAnio = new Map();
  for (const h of hojas) {
    if (h.tipo === "banco") {
      const r = leerBanco(h._filas, h._clasif);
      const sugerido = bancoSugerido(h.nombre);
      const existente = bancoPorClave.get(claveNombre(sugerido)) || null;
      let yaCargados = 0;
      if (existente && r.movimientos.length) {
        const claves = clavesMovimientos(existente.id, r.movimientos).map((m) => m.clave);
        yaCargados = await prisma.movimientoBanco.count({ where: { claveImportacion: { in: claves } } });
      }
      const anios = {};
      for (const m of r.movimientos) anios[m.fecha.slice(0, 4)] = (anios[m.fecha.slice(0, 4)] || 0) + 1;
      out.push({
        nombre: h.nombre, tipo: "banco", certeza: h.certeza, motivo: h.motivo, columnas: h.columnas, preseleccion: h.certeza === "seguro",
        bancoSugerido: sugerido, bancoExistenteId: existente?.id || null,
        movimientos: r.movimientos.length, creditos: r.movimientos.filter((m) => m.tipo === "credito").length, debitos: r.movimientos.filter((m) => m.tipo === "debito").length,
        anios, saldos: r.saldos.length, fechasDanadas: r.movimientos.filter((m) => m.fechaAproximada).length, sinDatos: r.problemas.length, ignoradas: r.ignoradas,
        yaCargados, nuevos: r.movimientos.length - yaCargados,
        muestra: r.movimientos.slice(0, 5).map((m) => ({ fecha: m.fecha, tipo: m.tipo, descripcion: m.descripcion, valor: m.valor, concepto: m.concepto, tercero: m.tercero })),
      });
    } else if (h.tipo === "pagos") {
      const r = leerPagos(h._filas, h._clasif);
      const pagos = clavesPagos(r.pagos);
      const existentes = await prisma.pagoProgramado.findMany({ where: { claveImportacion: { in: pagos.map((p) => p.clave) } }, select: { claveImportacion: true, gastoPeriodicoId: true } });
      const ya = new Map(existentes.map((e) => [e.claveImportacion, e]));
      const anio = anioMasComun(r.pagos);
      const sinSaldos = pagos.filter((p) => p.tipo !== "S");
      const periodicos = inferirPeriodicos(sinSaldos).map((g) => {
        const delGrupo = pagos.filter((p) => p.tipo !== "S" && claveGrupo(p) === g.clave);
        const yaExiste = delGrupo.some((p) => ya.get(p.clave)?.gastoPeriodicoId);
        return { ...g, yaExiste, tipoTexto: TIPOS_PAGO[g.tipo], periodicidadTexto: PERIODICIDADES[g.periodicidad], valorTexto: fmtMoneda(g.valor) };
      });
      const nuevosCat = {};
      const existe = { item: new Set(cat.items.map((x) => claveNombre(x.nombre))), concepto: new Set(cat.conceptos.map((x) => claveNombre(x.nombre))), medio: new Set(cat.medios.map((x) => claveNombre(x.nombre))), pagador: new Set(cat.pagadores.map((x) => claveNombre(x.nombre))) };
      for (const [tipo, campo] of [["item", "item"], ["concepto", "concepto"], ["medio", "medio"], ["pagador", "paga"]]) {
        nuevosCat[tipo] = [...new Set(sinSaldos.map((p) => p[campo]).filter(Boolean).map((v) => claveNombre(v)))].filter((k) => k && !existe[tipo].has(k)).length;
      }
      const h2 = {
        nombre: h.nombre, tipo: "pagos", certeza: h.certeza, motivo: h.motivo, columnas: h.columnas, anio,
        pagos: sinSaldos.length, pendientes: sinSaldos.filter((p) => p.estado === "P").length, pagados: sinSaldos.filter((p) => p.estado === "E").length,
        enCero: sinSaldos.filter((p) => p.valorVacio).length, sinDatos: r.problemas.length,
        saldos: pagos.filter((p) => p.tipo === "S").map((p) => ({ item: p.item, concepto: p.concepto, medio: p.medio, anio: p.anio, mes: p.mes, valor: p.valor, valorTexto: fmtMoneda(p.valor) })),
        yaCargados: sinSaldos.filter((p) => ya.has(p.clave)).length, nuevos: sinSaldos.filter((p) => !ya.has(p.clave)).length,
        porTipo: Object.fromEntries(Object.keys(TIPOS_PAGO).map((t) => [t, sinSaldos.filter((p) => p.tipo === t).length])),
        nuevosCatalogo: nuevosCat, periodicos,
      };
      if (h.certeza === "seguro" && anio && (!mayorPorAnio.has(anio) || mayorPorAnio.get(anio).pagos < h2.pagos)) mayorPorAnio.set(anio, h2);
      out.push(h2);
    } else {
      out.push({ nombre: h.nombre, tipo: null, motivo: h.motivo, filas: h.filas });
    }
  }
  // Solo se preselecciona la pestaña de pagos más grande del año más reciente (la del año en curso, «Detalle 2026»).
  const anioMax = Math.max(0, ...mayorPorAnio.keys());
  for (const h of out) if (h.tipo === "pagos") {
    h.preseleccion = anioMax > 0 && h.anio === anioMax && mayorPorAnio.get(h.anio) === h;
    if (h.preseleccion || h.certeza !== "seguro") continue;
    if (h.anio !== anioMax) h.motivo += ` Son pagos de ${h.anio}: márcala solo si quieres cargarlos como histórico.`;
    else h.motivo += ` Ya hay una pestaña de pagos más grande para ${h.anio} («${mayorPorAnio.get(h.anio)?.nombre}»): márcala solo si son pagos distintos, no otra vista de los mismos.`;
  }
  return { archivo: limpiar(nombre, 200), hojas: out, bancos: cat.bancos.filter((b) => b.activo).map((b) => ({ id: b.id, nombre: b.nombre })) };
}

// ---------- Aplicar ----------

// Caché de catálogos por clave de nombre: crea lo que falte una sola vez.
async function cacheCatalogos(actor) {
  const cat = await catalogos();
  const mapa = {
    item: new Map(cat.items.map((x) => [claveNombre(x.nombre), x])), concepto: new Map(cat.conceptos.map((x) => [claveNombre(x.nombre), x])),
    medio: new Map(cat.medios.map((x) => [claveNombre(x.nombre), x])), pagador: new Map(cat.pagadores.map((x) => [claveNombre(x.nombre), x])),
  };
  const creados = { item: 0, concepto: 0, medio: 0, pagador: 0 };
  return {
    creados,
    async id(tipo, nombre, extra = {}) {
      const k = claveNombre(nombre);
      if (!k) return null;
      if (!mapa[tipo].has(k)) {
        mapa[tipo].set(k, await crearMaestro(quien(actor), tipo, { nombre, ...extra }, { silencioso: true }));
        creados[tipo]++;
      }
      return mapa[tipo].get(k).id;
    },
  };
}

async function aplicarBanco(actor, h, decision, alertas) {
  let banco = decision.bancoId ? await prisma.bancoTesoreria.findUnique({ where: { id: Number(decision.bancoId) } }) : null;
  let bancoCreado = false;
  if (!banco) {
    const nombre = limpiar(decision.nombre || bancoSugerido(h.nombre), 120);
    if (!nombre) throw badRequest(`Ponle nombre al banco de la pestaña «${h.nombre}».`);
    const existente = (await prisma.bancoTesoreria.findMany()).find((b) => claveNombre(b.nombre) === claveNombre(nombre));
    banco = existente || (await crearMaestro(quien(actor), "banco", { nombre }));
    bancoCreado = !existente;
  }
  const r = leerBanco(h._filas, h._clasif);
  const movs = clavesMovimientos(banco.id, r.movimientos);
  const res = await prisma.movimientoBanco.createMany({
    data: movs.map((m) => ({
      bancoId: banco.id, tipo: m.tipo, fecha: m.fecha, fechaAproximada: m.fechaAproximada, descripcion: limpiar(m.descripcion, 300) || "(sin descripción)",
      valor: m.valor, moneda: banco.moneda, concepto: limpiar(m.concepto, 200), tercero: limpiar(m.tercero, 200), observacion: limpiar(m.observacion, 1000),
      referencia: limpiar(m.referencia, 120), tipoCarga: limpiar(m.tipoCarga, 80), tipoSolicitud: limpiar(m.tipoSolicitud, 80), preparador: limpiar(m.preparador, 120), formato: limpiar(m.formato, 120),
      origen: "importacion", claveImportacion: m.clave, verificadoAt: new Date(), verificadoPorNombre: `Plantilla «${limpiar(h.nombre, 80)}»`, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || ORIGEN.nombre,
    })),
    skipDuplicates: true,
  });
  // Saldos reportados por el banco (filas SALDO): uno por banco, año, mes y tipo.
  const vistos = new Set();
  const saldos = r.saldos.filter((s) => { const k = `${s.anio}|${s.mes}|${s.tipo}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  const rs = await prisma.saldoReportadoBanco.createMany({
    data: saldos.map((s) => ({ bancoId: banco.id, anio: s.anio, mes: s.mes, tipo: s.tipo, valor: s.valor, texto: limpiar(s.texto, 120), clave: `${banco.id}|${s.anio}|${s.mes}|${s.tipo}`, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || ORIGEN.nombre })),
    skipDuplicates: true,
  });
  const aprox = movs.filter((m) => m.fechaAproximada);
  if (aprox.length) {
    const ids = new Map((await prisma.movimientoBanco.findMany({ where: { claveImportacion: { in: aprox.map((m) => m.clave) } }, select: { id: true, claveImportacion: true } })).map((x) => [x.claveImportacion, x.id]));
    for (const m of aprox) alertas.push({ tipo: "fechaDanada", refTipo: "movimiento", refId: ids.get(m.clave) || null, clave: `mov|${m.clave}`, mensaje: `${banco.nombre}, fila ${m.fila} de «${h.nombre}»: la fecha «${m.fechaOriginal || "vacía"}» no es válida; se cargó el ${m.fecha} (solo el mes). Corrige la fecha del movimiento «${m.descripcion}» por ${fmtMoneda(m.valor, banco.moneda)}.` });
  }
  for (const p of r.problemas) alertas.push({ tipo: "sinDatos", refTipo: "banco", refId: banco.id, clave: `fila|${banco.id}|${h.nombre}|${p.fila}|${norm(p.texto)}`, mensaje: `${banco.nombre}, fila ${p.fila} de «${h.nombre}»: ${p.motivo}${p.texto ? ` («${p.texto}»)` : ""}; no se cargó.` });
  return { hoja: h.nombre, banco: banco.nombre, bancoCreado, movimientos: movs.length, nuevos: res.count, repetidos: movs.length - res.count, saldosReportados: rs.count, fechasDanadas: aprox.length };
}

async function aplicarPagos(actor, h, cache, decisionesPeriodicos, diaCorteDefecto, alertas) {
  const r = leerPagos(h._filas, h._clasif);
  const pagos = clavesPagos(r.pagos);
  const bancos = await prisma.bancoTesoreria.findMany();
  // 1. Saldos (S): no son pagos; quedan como alerta para registrarlos en Saldos iniciales.
  for (const p of pagos.filter((x) => x.tipo === "S")) {
    const texto = claveNombre(`${p.item || ""} ${p.concepto} ${p.medio || ""}`);
    const banco = bancos.find((b) => texto.includes(claveNombre(b.nombre)) || texto.includes(claveNombre(b.nombre).replace(/^banco /, "")));
    alertas.push({ tipo: "saldoInicial", refTipo: banco ? "banco" : null, refId: banco?.id || null, clave: `saldo|${p.anio}|${claveNombre(p.concepto)}|${claveNombre(p.medio)}|${Math.round(p.valor)}`, mensaje: `El Excel trae «${p.concepto}» (${p.item || "sin ítem"}, medio ${p.medio || "—"}) por ${fmtMoneda(p.valor)} en ${String(p.mes).padStart(2, "0")}/${p.anio}. No se cargó como pago: si es el saldo inicial de un banco, regístralo en Saldos iniciales.` });
  }
  const filas = pagos.filter((p) => p.tipo !== "S");
  // 2. Catálogos (lo que falte se crea; el concepto toma como ítem por defecto el de su primera fila).
  const conIds = [];
  for (const p of filas) {
    const itemId = await cache.id("item", p.item);
    conIds.push({ ...p, itemId, conceptoId: await cache.id("concepto", p.concepto, { itemId }), medioPagoId: await cache.id("medio", p.medio), pagadorId: await cache.id("pagador", p.paga) });
  }
  // 3. Pagos: nuevos se crean; los que ya estaban se actualizan solo si en la app seguían en P sin movimientos y en el
  //    Excel ya están en E.
  const existentes = await prisma.pagoProgramado.findMany({ where: { claveImportacion: { in: conIds.map((p) => p.clave) } }, include: { _count: { select: { asociaciones: true } } } });
  const ya = new Map(existentes.map((e) => [e.claveImportacion, e]));
  const nuevos = conIds.filter((p) => !ya.has(p.clave));
  const creados = await prisma.pagoProgramado.createMany({
    data: nuevos.map((p) => ({
      anio: p.anio, mes: p.mes, fecha: fechaDe(p.anio, p.mes, 1), fechaAproximada: true, tipo: p.tipo, estado: p.estado, estadoPor: p.estado === "E" ? "importacion" : null,
      itemId: p.itemId, conceptoId: p.conceptoId, concepto: limpiar(p.concepto, 200), medioPagoId: p.medioPagoId, pagadorId: p.pagadorId, valor: p.valor,
      observacion: limpiar(p.observacion, 1000), origen: "importacion", claveImportacion: p.clave, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || ORIGEN.nombre,
    })),
    skipDuplicates: true,
  });
  let actualizados = 0;
  for (const p of conIds) {
    const e = ya.get(p.clave);
    if (e && e.estado === "P" && p.estado === "E" && !e._count.asociaciones) {
      await prisma.pagoProgramado.update({ where: { id: e.id }, data: { estado: "E", estadoPor: "importacion", valor: p.valor } });
      actualizados++;
    }
  }
  const idPorClave = new Map((await prisma.pagoProgramado.findMany({ where: { claveImportacion: { in: conIds.map((p) => p.clave) } }, select: { id: true, claveImportacion: true, gastoPeriodicoId: true, valor: true } })).map((x) => [x.claveImportacion, x]));
  // 4. Valores en 0: se cargan así y quedan como alerta.
  for (const p of conIds.filter((x) => x.valorVacio)) {
    const id = idPorClave.get(p.clave);
    if (id && Number(id.valor) === 0) alertas.push({ tipo: "valorCero", refTipo: "pago", refId: id.id, clave: `cero|${p.clave}`, mensaje: `«${p.concepto}» (${p.item || "sin ítem"}) de ${String(p.mes).padStart(2, "0")}/${p.anio} vino sin valor en el Excel («${h.nombre}», fila ${p.fila}): se cargó en 0 y estado ${p.estado}. Pon el valor real.` });
  }
  for (const p of r.problemas) alertas.push({ tipo: "sinDatos", clave: `fila|${h.nombre}|${p.fila}|${norm(p.texto)}`, mensaje: `Fila ${p.fila} de «${h.nombre}»: ${p.motivo}${p.texto ? ` («${p.texto}»)` : ""}; no se cargó.` });

  // 5. Gastos periódicos que la persona confirmó: se crean y sus pagos del Excel quedan enlazados a ellos (con la fecha
  //    del día de corte). No generan pagos nuevos aquí: el año ya viene en la plantilla.
  const propuestos = inferirPeriodicos(filas);
  let gastos = 0;
  let enlazados = 0;
  for (const d of decisionesPeriodicos) {
    const g = propuestos.find((x) => x.clave === d.clave);
    if (!g) continue;
    const delGrupo = conIds.filter((p) => claveGrupo(p) === g.clave).sort((a, b) => a.mes - b.mes || a.fila - b.fila);
    if (delGrupo.some((p) => idPorClave.get(p.clave)?.gastoPeriodicoId)) continue; // ya existe de una carga anterior
    const periodicidad = PERIODICIDADES[d.periodicidad] ? d.periodicidad : g.periodicidad;
    const diaCorte = Math.min(31, Math.max(1, Number(d.diaCorte) || Number(diaCorteDefecto) || 1));
    const p0 = delGrupo[0];
    const gasto = await crearGasto(quien(actor), {
      tipo: g.tipo, conceptoId: p0.conceptoId, itemId: p0.itemId, medioPagoId: p0.medioPagoId, pagadorId: p0.pagadorId,
      valor: Math.abs(g.valor), sentido: g.valor < 0 ? "sale" : "entra", periodicidad, diaCorte, fechaInicio: fechaDe(g.anio, g.mesInicio, 1),
    }, { generar: false, silencioso: true });
    gastos++;
    const porMes = new Map();
    for (const p of delGrupo) {
      const n = (porMes.get(p.mes) || 0) + 1;
      porMes.set(p.mes, n);
      if (n > (periodicidad === "quincenal" ? 2 : 1)) continue; // filas de más en el mismo mes quedan como extraordinarias
      const id = idPorClave.get(p.clave)?.id;
      if (!id) continue;
      const base = fechaDe(p.anio, p.mes, diaCorte);
      await prisma.pagoProgramado.update({
        where: { id },
        data: { gastoPeriodicoId: gasto.id, periodo: `${p.anio}-${String(p.mes).padStart(2, "0")}${n === 2 ? "-Q2" : ""}`, fecha: n === 2 ? sumarDias(base, 15) : base, fechaAproximada: false },
      });
      enlazados++;
    }
  }
  return { hoja: h.nombre, pagos: conIds.length, nuevos: creados.count, actualizados, repetidos: conIds.length - creados.count - actualizados, saldosOmitidos: pagos.length - filas.length, gastosPeriodicos: gastos, pagosEnlazados: enlazados, enCero: conIds.filter((p) => p.valorVacio).length };
}

// decisiones: { bancos: [{ hoja, bancoId?, nombre? }], pagos: [{ hoja }], periodicos: [{ hoja, clave, periodicidad, diaCorte }], diaCorteDefecto }
export async function aplicarPlantilla(actor, buffer, nombre, decisiones = {}) {
  const hojas = prepararArchivo(buffer, nombre);
  const porNombre = new Map(hojas.map((h) => [h.nombre, h]));
  const bancos = Array.isArray(decisiones.bancos) ? decisiones.bancos : [];
  const pagos = Array.isArray(decisiones.pagos) ? decisiones.pagos : [];
  if (!bancos.length && !pagos.length) throw badRequest("Marca al menos una pestaña para cargar.");
  for (const d of [...bancos, ...pagos]) if (!porNombre.get(d.hoja)?._clasif) throw badRequest(`La pestaña «${d.hoja}» no se puede leer como banco ni como pagos.`);
  const alertas = [];
  const resultado = { bancos: [], pagos: [] };
  // Primero los bancos (las alertas de saldos de los pagos los buscan por nombre).
  for (const d of bancos) resultado.bancos.push(await aplicarBanco(actor, porNombre.get(d.hoja), d, alertas));
  const cache = await cacheCatalogos(actor);
  for (const d of pagos) {
    const per = (decisiones.periodicos || []).filter((p) => p.hoja === d.hoja);
    resultado.pagos.push(await aplicarPagos(actor, porNombre.get(d.hoja), cache, per, decisiones.diaCorteDefecto, alertas));
  }
  resultado.catalogosCreados = cache.creados;
  resultado.alertas = await crearAlertas(actor, alertas);
  const resumen = [
    ...resultado.bancos.map((b) => `${b.banco}: ${b.nuevos} movimiento(s) nuevos de ${b.movimientos}`),
    ...resultado.pagos.map((p) => `«${p.hoja}»: ${p.nuevos} pago(s) nuevos, ${p.actualizados} actualizados, ${p.gastosPeriodicos} gasto(s) periódico(s)`),
  ].join(" · ");
  logTesoreria(actor, {
    action: "importar", entityType: "importacionTesoreria", recordId: Date.now(), recordInfo: `Plantilla «${limpiar(nombre, 120)}»: ${resumen}`.slice(0, 480),
    after: { archivo: limpiar(nombre, 200), resumen: resumen.slice(0, 900), alertas: resultado.alertas, catalogos: Object.entries(cache.creados).map(([k, v]) => `${k}: ${v}`).join(", ") },
  }).catch(() => {});
  return resultado;
}
