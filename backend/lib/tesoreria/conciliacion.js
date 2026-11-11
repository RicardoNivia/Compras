import { prisma } from "@/lib/prisma";
import { publicarPagoPagado, publicarMovimientosRegistrados } from "@/lib/tesoreria/eventos";
import { reporteSaldos } from "@/lib/tesoreria/saldos";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { mapasCatalogos } from "@/lib/tesoreria/maestros";
import { asignadoDe } from "@/lib/tesoreria/asociaciones";
import { badRequest, notFound, fmtMoneda, redondear, rangoMes, TIPOS_PAGO, limpiar as limpiarTexto } from "@/lib/tesoreria/comun";

// Conciliación de Tesorería, por mes y banco, en cuatro preguntas que la pantalla muestra como pasos:
//   1. ¿El saldo cuadra con el banco?  saldo inicial del mes (el de enero digitado + lo registrado antes) + créditos −
//      débitos = saldo calculado, contra el saldo final que dice el banco (extracto subido o filas SALDO de la plantilla).
//   2. ¿Todo lo registrado está en el banco?  movimientos registrados a mano que ningún extracto confirmó.
//   3. ¿Cada movimiento tiene su pago?  movimientos con valor sin asignar a pagos programados (con la propuesta del
//      agente al lado) y pagos del mes que siguen sin movimiento.
//   4. Cerrar el mes: se firma cuando todos los bancos con movimientos tienen saldo inicial y, si hay saldo del banco,
//      la diferencia es 0. Lo demás son avisos. Un mes firmado es de solo lectura (comun.js#exigirMesAbierto).

const num = (d) => (d == null ? null : Number(d));
const TOL = 0.5;

async function cifrasBanco(banco, anio, mes) {
  const { desde, hasta } = rangoMes(anio, mes);
  const [ini, antes, delMes, reportados, extractos] = await Promise.all([
    prisma.saldoInicialBanco.findUnique({ where: { bancoId_anio: { bancoId: banco.id, anio } } }),
    prisma.movimientoBanco.groupBy({ by: ["tipo"], where: { bancoId: banco.id, fecha: { gte: `${anio}-01-01`, lt: desde } }, _sum: { valor: true } }),
    prisma.movimientoBanco.findMany({ where: { bancoId: banco.id, fecha: { gte: desde, lte: hasta } }, include: { asociaciones: { select: { valor: true } } }, orderBy: [{ fecha: "asc" }, { id: "asc" }] }),
    prisma.saldoReportadoBanco.findMany({ where: { bancoId: banco.id, anio, mes } }),
    prisma.extractoBancario.findMany({ where: { bancoId: banco.id, desde: { lte: hasta }, hasta: { gte: desde } }, orderBy: { createdAt: "desc" } }),
  ]);
  const suma = (lista, tipo) => redondear(lista.filter((m) => m.tipo === tipo).reduce((s, m) => s + Number(m.valor), 0));
  const previo = (tipo) => num(antes.find((g) => g.tipo === tipo)?._sum.valor) || 0;
  // Saldo con el que arranca el mes: el de Saldos de bancos (anclado al último saldo que reportó el banco antes del mes;
  // si no hay, el saldo inicial digitado + lo registrado). Así la conciliación sigue a los extractos que se van subiendo.
  const anclado = (await reporteSaldos(anio, { bancoId: banco.id })).items[0]?.meses[mes - 1];
  const saldoInicial = anclado?.saldoInicialPrevio ?? anclado?.saldoInicial ?? (ini ? redondear(num(ini.valor) + previo("credito") - previo("debito")) : null);
  const creditos = suma(delMes, "credito");
  const debitos = suma(delMes, "debito");
  const saldoCalculado = saldoInicial == null ? null : redondear(saldoInicial + creditos - debitos);
  const repFinal = reportados.find((r) => r.tipo === "final");
  const repInicial = reportados.find((r) => r.tipo === "inicial");
  const saldoBanco = repFinal ? num(repFinal.valor) : null;
  // Extracto parcial (lo del día, lo que va del mes): el banco dio el saldo a una fecha antes de fin de mes; se compara
  // con lo registrado hasta esa misma fecha.
  const corteBanco = repFinal?.fecha && repFinal.fecha < hasta ? repFinal.fecha : null;
  const hastaCorte = corteBanco ? delMes.filter((m) => m.fecha <= corteBanco) : delMes;
  const saldoCalculadoCorte = saldoInicial == null ? null : redondear(saldoInicial + suma(hastaCorte, "credito") - suma(hastaCorte, "debito"));
  const diferencia = saldoCalculadoCorte != null && saldoBanco != null ? redondear(saldoCalculadoCorte - saldoBanco) : null;
  const porVerificar = delMes.filter((m) => !m.verificadoAt);
  const sinAsociar = delMes.filter((m) => Number(m.valor) - asignadoDe(m.asociaciones) > TOL);
  let estado;
  if (!delMes.length && saldoBanco == null) estado = "sinMovimientos";
  else if (saldoInicial == null) estado = "sinSaldoInicial";
  else if (saldoBanco == null) estado = "sinSaldoBanco";
  else if (Math.abs(diferencia) > TOL) estado = "diferencia";
  else estado = "cuadra";
  return {
    bancoId: banco.id, banco: banco.nombre, moneda: banco.moneda, estado,
    saldoInicialAnio: ini ? num(ini.valor) : null, saldoInicial, creditos, debitos, saldoCalculado,
    saldoBanco, saldoBancoFuente: repFinal?.texto || null, corteBanco, saldoCalculadoCorte,
    saldoInicialBanco: repInicial ? num(repInicial.valor) : null,
    // El saldo inicial del banco solo se compara si es del primer día del mes (un extracto parcial empieza a mitad de mes).
    diferenciaInicial: saldoInicial != null && repInicial && (!repInicial.fecha || repInicial.fecha === desde) ? redondear(saldoInicial - num(repInicial.valor)) : null,
    diferencia, movimientos: delMes.length, porVerificar: porVerificar.length, sinAsociar: sinAsociar.length,
    asociados: delMes.length - sinAsociar.length,
    extractos: extractos.filter((e, i) => extractos.findIndex((x) => x.archivo === e.archivo) === i).map((e) => ({ id: e.id, archivo: e.archivo, formato: e.formato, desde: e.desde, hasta: e.hasta, nuevos: e.nuevos, repetidos: e.repetidos, saldoInicial: num(e.saldoInicial), saldoFinal: num(e.saldoFinal), createdAt: e.createdAt, creadoPorNombre: e.creadoPorNombre })),
    _delMes: delMes, _porVerificar: porVerificar, _sinAsociar: sinAsociar,
  };
}

const sinPrivados = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith("_")));

async function cierreDe(anio, mes) {
  const c = await prisma.cierreMes.findUnique({ where: { anio_mes: { anio, mes } } });
  return c ? { firmado: true, firmadoPorNombre: c.firmadoPorNombre, firmadoAt: c.createdAt, saldos: (() => { try { return JSON.parse(c.saldos); } catch { return []; } })() } : { firmado: false };
}

// Qué impide firmar (bloqueos) y qué conviene revisar (avisos), con todos los bancos.
function revisionCierre(bancos, pagosPendientes, anio, mes) {
  const bloqueos = [];
  const avisos = [];
  for (const b of bancos) {
    if (b.estado === "sinMovimientos") continue;
    if (b.estado === "sinSaldoInicial") bloqueos.push(`${b.banco}: falta el saldo inicial de enero ${anio} (Saldos de bancos).`);
    if (b.estado === "diferencia") bloqueos.push(`${b.banco}: el saldo calculado no da igual al del banco (diferencia ${fmtMoneda(b.diferencia, b.moneda)}).`);
    if (b.estado === "sinSaldoBanco") avisos.push(`${b.banco}: no hay extracto ni saldo del banco de este mes; no se pudo comparar.`);
    if (b.porVerificar) avisos.push(`${b.banco}: ${b.porVerificar} movimiento(s) registrados a mano que el banco no ha confirmado.`);
  }
  return { bloqueos, avisos, puedeFirmar: !bloqueos.length };
}

export async function estadoMes({ anio, mes }) {
  const hoy = hoyColombia();
  anio = Number(anio) || Number(hoy.slice(0, 4));
  mes = Number(mes) || Number(hoy.slice(5, 7));
  const bancos = await prisma.bancoTesoreria.findMany({ orderBy: { nombre: "asc" } });
  const cifras = [];
  for (const b of bancos) {
    const c = await cifrasBanco(b, anio, mes);
    if (b.activo || c.movimientos) cifras.push(sinPrivados(c));
  }
  const [pagosPendientes, pagosSinMov, cierre] = await Promise.all([
    prisma.pagoProgramado.count({ where: { anio, mes, estado: "P", tipo: { in: ["E", "I", "J"] } } }),
    prisma.pagoProgramado.count({ where: { anio, mes, NOT: { valor: 0 }, asociaciones: { none: {} } } }),
    cierreDe(anio, mes),
  ]);
  return { anio, mes, bancos: cifras, pagosPendientes, pagosSinMovimiento: pagosSinMov, cierre, revision: revisionCierre(cifras, pagosPendientes, anio, mes) };
}

export async function detalleBanco({ bancoId, anio, mes }) {
  const banco = await prisma.bancoTesoreria.findUnique({ where: { id: Number(bancoId) || 0 } });
  if (!banco) throw notFound("El banco no existe.");
  anio = Number(anio); mes = Number(mes);
  const c = await cifrasBanco(banco, anio, mes);
  const { desde, hasta } = rangoMes(anio, mes);
  const extractos = await prisma.extractoBancario.findMany({ where: { bancoId: banco.id, desde: { lte: hasta }, hasta: { gte: desde } }, orderBy: { createdAt: "asc" } });
  const mov = (m) => ({
    id: m.id, fecha: m.fecha, tipo: m.tipo, descripcion: m.descripcion, concepto: m.concepto, tercero: m.tercero, origen: m.origen,
    valor: Number(m.valor), valorTexto: fmtMoneda(m.valor, m.moneda), creadoPorNombre: m.creadoPorNombre,
  });
  const diagnostico = diagnosticar({ diferencia: c.diferencia, diferenciaInicial: c.diferenciaInicial, delMes: c._delMes, extractos, desde, hasta, moneda: banco.moneda });
  const noEnBancoIds = new Set(diagnostico.noEnBanco.map((m) => m.id));
  return {
    ...sinPrivados(c), anio, mes,
    diagnostico,
    // Registrados que el banco aún no confirma porque ningún extracto cubre su fecha (no son diferencia todavía).
    listaPorVerificar: c._porVerificar.filter((m) => !noEnBancoIds.has(m.id)).map(mov),
    cierre: await cierreDe(anio, mes),
  };
}

// «Sí, está en el banco»: lo registrado a mano queda verificado aunque no haya llegado en un extracto.
export async function verificarMovimiento(actor, movimientoId, verificado = true) {
  const m = await prisma.movimientoBanco.findUnique({ where: { id: Number(movimientoId) || 0 } });
  if (!m) throw notFound("El movimiento no existe.");
  const [anio, mes] = m.fecha.split("-").map(Number);
  if ((await cierreDe(anio, mes)).firmado) throw badRequest("Ese mes ya está cerrado.");
  await prisma.movimientoBanco.update({ where: { id: m.id }, data: verificado ? { verificadoAt: new Date(), verificadoPorNombre: actor.nombre || null } : { verificadoAt: null, verificadoPorNombre: null, extractoId: null } });
  logTesoreria(actor, {
    action: verificado ? "verificar" : "desverificar", entityType: "conciliacionTesoreria", recordId: m.id,
    recordInfo: `Movimiento #${m.id} ${m.fecha} ${m.descripcion}`,
    before: { movimiento: `#${m.id} ${fmtMoneda(m.valor, m.moneda)}`, verificado: m.verificadoAt ? "Sí" : "No" },
    after: { movimiento: `#${m.id} ${fmtMoneda(m.valor, m.moneda)}`, verificado: verificado ? "Sí, confirmado a mano" : "No" },
  }).catch(() => {});
  return { ok: true };
}

export async function firmarCierre(actor, { anio, mes }) {
  anio = Number(anio); mes = Number(mes);
  if (!anio || !(mes >= 1 && mes <= 12)) throw badRequest("Mes inválido.");
  const e = await estadoMes({ anio, mes });
  if (e.cierre.firmado) throw badRequest("Ese mes ya está cerrado.");
  if (!e.revision.puedeFirmar) throw badRequest(`Todavía no se puede cerrar: ${e.revision.bloqueos.join(" ")}`);
  const saldos = e.bancos.filter((b) => b.estado !== "sinMovimientos").map((b) => ({ banco: b.banco, moneda: b.moneda, calculado: b.saldoCalculado, banco_: b.saldoBanco, diferencia: b.diferencia }));
  await prisma.cierreMes.create({ data: { anio, mes, saldos: JSON.stringify(saldos), firmadoPorUserId: actor.id, firmadoPorNombre: actor.nombre || null, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  logTesoreria(actor, {
    action: "firmar", entityType: "cierreTesoreria", recordId: `${anio}-${mes}`, recordInfo: `Cierre de ${String(mes).padStart(2, "0")}/${anio}`,
    after: { periodo: `${String(mes).padStart(2, "0")}/${anio}`, diferencias: saldos.map((s) => `${s.banco}: calculado ${fmtMoneda(s.calculado, s.moneda)}${s.banco_ != null ? ` · banco ${fmtMoneda(s.banco_, s.moneda)}` : " · sin saldo del banco"}`).join(" · ") },
  }).catch(() => {});
  return { ok: true, avisos: e.revision.avisos };
}

export async function reabrirCierre(actor, { anio, mes }) {
  anio = Number(anio); mes = Number(mes);
  const c = await prisma.cierreMes.findUnique({ where: { anio_mes: { anio, mes } } });
  if (!c) throw badRequest("Ese mes no está cerrado.");
  await prisma.cierreMes.delete({ where: { id: c.id } });
  logTesoreria(actor, { action: "reabrir", entityType: "cierreTesoreria", recordId: `${anio}-${mes}`, recordInfo: `Reabrió el cierre de ${String(mes).padStart(2, "0")}/${anio} (lo había firmado ${c.firmadoPorNombre || "—"})`, before: { periodo: `${String(mes).padStart(2, "0")}/${anio}`, diferencias: "Cerrado" }, after: { periodo: `${String(mes).padStart(2, "0")}/${anio}`, diferencias: "Abierto" } }).catch(() => {});
  return { ok: true };
}

// ---------- Diagnóstico de la diferencia (movimientos del sistema vs. extracto del banco) ----------
// No toca pagos ni asociaciones (eso es del agente de asociación). Explica de dónde puede salir la diferencia del mes:
//  1. Líneas que el banco trae y no están registradas (las que no se aprobaron al subir el extracto).
//  2. Movimientos registrados, en fechas que cubre un extracto, que el banco NO trae.
//  3. Pistas sobre lo que quede sin explicar: un movimiento por el mismo valor, uno con el tipo al revés (vale la mitad),
//     duplicados, dígitos invertidos (la diferencia es múltiplo de 9) o dos movimientos que juntos dan la diferencia.
// Cada hallazgo trae la acción que lo corrige; la persona la aprueba (nada se cambia solo).
const firmado = (m) => (m.tipo === "credito" ? Number(m.valor) : -Number(m.valor));
const iguales = (a, b) => Math.abs(a - b) < 0.5;

function pendientesDe(extractos, delMes, desde, hasta) {
  const usados = new Set();
  const out = [];
  for (const e of extractos) {
    let lista = [];
    try { lista = JSON.parse(e.pendientes || "[]"); } catch { lista = []; }
    for (const l of lista) {
      if (l.fecha < desde || l.fecha > hasta) continue;
      // Si ya se registró después (a mano o en otro archivo), deja de estar pendiente.
      const ya = delMes.find((m) => !usados.has(m.id) && (m.claveImportacion === l.clave || (m.fecha === l.fecha && m.tipo === l.tipo && iguales(Number(m.valor), l.valor))));
      if (ya) { usados.add(ya.id); continue; }
      out.push({ ...l, extractoId: e.id, archivo: e.archivo });
    }
  }
  return out;
}

// Valor con dos dígitos vecinos intercambiados (12.345 → 13.245…): todas las variantes.
function transposiciones(valor) {
  const t = String(Math.round(valor));
  const out = [];
  for (let i = 0; i < t.length - 1; i++) if (t[i] !== t[i + 1]) out.push(Number(t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2)));
  return out;
}

export function diagnosticar({ diferencia, diferenciaInicial, delMes, extractos, desde, hasta, moneda }) {
  const $ = (v) => fmtMoneda(v, moneda);
  const cubierto = (f) => extractos.some((e) => e.desde && e.hasta && f >= e.desde && f <= e.hasta);
  const faltan = pendientesDe(extractos, delMes, desde, hasta);
  // «Lo tengo y el banco no»: en fechas que cubre un extracto, sin un extracto que lo confirme (lo de la plantilla o lo
  // registrado a mano no cuenta como confirmado por el banco hasta que un extracto lo trae).
  const noEnBanco = delMes.filter((m) => !m.extractoId && cubierto(m.fecha));
  const mov = (m) => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, valor: Number(m.valor), firmado: firmado(m), descripcion: m.descripcion, origen: m.origen, creadoPorNombre: m.creadoPorNombre });
  // Lo que explican las dos listas: lo registrado que el banco no trae suma al sistema; lo que trae el banco y no está, le falta.
  const explicado = redondear(noEnBanco.reduce((x, m) => x + firmado(m), 0) - faltan.reduce((x, l) => x + (l.tipo === "credito" ? l.valor : -l.valor), 0));
  const D = diferencia == null ? null : redondear(diferencia);
  const restante = D == null ? null : redondear(D - explicado);
  const pistas = [];
  if (D != null && Math.abs(D) > 0.5) {
    const objetivo = Math.abs(restante) > 0.5 ? restante : D;
    const yaPista = new Set();
    const agregar = (p) => { const k = `${p.tipo}|${p.movimiento?.id || ""}|${p.clave || ""}`; if (!yaPista.has(k)) { yaPista.add(k); pistas.push(p); } };
    if (diferenciaInicial != null && Math.abs(diferenciaInicial) > 0.5) {
      agregar({ tipo: "inicial", confianza: iguales(diferenciaInicial, D) ? "alta" : "media", texto: `El mes ya empieza con ${$(diferenciaInicial)} de diferencia contra el saldo inicial del extracto: ${iguales(diferenciaInicial, D) ? "toda la diferencia viene de meses anteriores" : "parte de la diferencia viene de meses anteriores"}. Revisa el mes anterior.` });
    }
    for (const m of delMes) {
      // Sobra: un movimiento registrado por exactamente la diferencia.
      if (iguales(firmado(m), objetivo)) agregar({ tipo: "sobra", confianza: m.extractoId ? "media" : "alta", movimiento: mov(m), texto: `«${m.descripcion}» (${$(firmado(m))}, ${m.fecha}) vale exactamente la diferencia${m.extractoId ? "" : " y el banco no lo trae"}: puede estar de más o duplicado.`, accion: "eliminar" });
      // Tipo al revés: registrado como crédito siendo débito (o al revés) desvía el doble de su valor.
      if (iguales(2 * firmado(m), objetivo)) agregar({ tipo: "tipoAlReves", confianza: "alta", movimiento: mov(m), texto: `«${m.descripcion}» (${m.fecha}) vale la mitad de la diferencia: probablemente se registró como ${m.tipo === "credito" ? "crédito (entra) y es débito (sale)" : "débito (sale) y es crédito (entra)"}.`, accion: "cambiarTipo" });
      // Dígitos invertidos: la diferencia es múltiplo de 9 y cambiando dos dígitos vecinos del valor se explica.
      if (Math.abs(objetivo) >= 9 && Math.round(Math.abs(objetivo)) % 9 === 0) {
        for (const v of transposiciones(Number(m.valor))) {
          if (iguales(Math.abs((m.tipo === "credito" ? 1 : -1) * (Number(m.valor) - v)), Math.abs(objetivo)) && iguales((m.tipo === "credito" ? 1 : -1) * (Number(m.valor) - v), objetivo)) {
            agregar({ tipo: "digitos", confianza: "media", movimiento: mov(m), valorSugerido: v, texto: `«${m.descripcion}» (${m.fecha}) está por ${$(Number(m.valor))}; si en realidad era ${$(v)} (dos dígitos invertidos), la diferencia desaparece.`, accion: "corregirValor" });
          }
        }
      }
    }
    // Duplicados: mismo día, tipo y valor más de una vez.
    const grupos = new Map();
    for (const m of delMes) { const k = `${m.fecha}|${m.tipo}|${Number(m.valor).toFixed(2)}`; grupos.set(k, [...(grupos.get(k) || []), m]); }
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      const sobra = g.find((m) => !m.extractoId) || g.at(-1);
      const explica = iguales(firmado(sobra), objetivo);
      agregar({ tipo: "duplicado", confianza: explica ? "alta" : "baja", movimiento: mov(sobra), texto: `«${sobra.descripcion}» aparece ${g.length} veces el ${sobra.fecha} por ${$(firmado(sobra))}${explica ? " y uno de ellos explica la diferencia" : ""}. Si el banco lo cobró una sola vez, sobra uno.`, accion: "eliminar" });
    }
    // Falta: una línea del extracto pendiente por exactamente lo que falta.
    for (const l of faltan) {
      const v = l.tipo === "credito" ? l.valor : -l.valor;
      if (iguales(-v, objetivo)) agregar({ tipo: "falta", confianza: "alta", clave: l.clave, extractoId: l.extractoId, texto: `El banco trae «${l.descripcion}» (${$(v)}, ${l.fecha}) y no está registrado: es justo la diferencia.`, accion: "registrar" });
    }
    // Dos movimientos que juntos dan la diferencia (los no verificados primero).
    const cand = [...delMes].sort((a, b) => (a.extractoId ? 1 : 0) - (b.extractoId ? 1 : 0)).slice(0, 300);
    let pares = 0;
    for (let i = 0; i < cand.length && pares < 2; i++) {
      for (let j = i + 1; j < cand.length && pares < 2; j++) {
        if (iguales(firmado(cand[i]) + firmado(cand[j]), objetivo)) {
          pares++;
          agregar({ tipo: "par", confianza: "baja", movimiento: mov(cand[i]), otro: mov(cand[j]), texto: `«${cand[i].descripcion}» y «${cand[j].descripcion}» juntos suman exactamente la diferencia (${$(objetivo)}). Revisa si alguno sobra.` });
        }
      }
    }
    if (Math.abs(restante) > 0.5 && !pistas.some((p) => p.confianza === "alta")) {
      agregar({ tipo: "sinExplicar", confianza: "baja", texto: `Quedan ${$(restante)} sin explicar con lo registrado ni con el extracto. ${restante > 0 ? "Tu registro tiene más plata que el banco: puede faltar registrar un débito (un cobro, comisión o pago) o sobrar un crédito." : "El banco tiene más plata que tu registro: puede faltar registrar un crédito (un ingreso) o sobrar un débito."} Compara día a día con el extracto.` });
    }
  }
  const ORDEN = { alta: 0, media: 1, baja: 2 };
  pistas.sort((a, b) => ORDEN[a.confianza] - ORDEN[b.confianza]);
  // Conciliación bancaria contable: partidas en libros que el banco no trae y partidas del banco que no están en libros.
  const suma = (l, t) => redondear(l.filter((x) => x.tipo === t).reduce((x, m) => x + Number(m.valor), 0));
  const contable = {
    creditosLibrosNoBanco: suma(noEnBanco, "credito"), debitosLibrosNoBanco: suma(noEnBanco, "debito"),
    creditosBancoNoLibros: suma(faltan, "credito"), debitosBancoNoLibros: suma(faltan, "debito"),
  };
  return {
    contable,
    faltan: faltan.map((l) => ({ clave: l.clave, extractoId: l.extractoId, archivo: l.archivo, fecha: l.fecha, tipo: l.tipo, valor: l.valor, firmado: l.tipo === "credito" ? l.valor : -l.valor, descripcion: l.descripcion })),
    noEnBanco: noEnBanco.map(mov),
    explicado, restante, pistas: pistas.slice(0, 12),
  };
}

// Aprobar una línea pendiente del extracto: registrarla (queda como movimiento verificado) o descartarla.
export async function resolverPendiente(actor, { extractoId, clave, accion }) {
  const e = await prisma.extractoBancario.findUnique({ where: { id: Number(extractoId) || 0 } });
  if (!e) throw notFound("El extracto no existe.");
  let lista = [];
  try { lista = JSON.parse(e.pendientes || "[]"); } catch { lista = []; }
  const l = lista.find((x) => x.clave === clave);
  if (!l) throw badRequest("Esa línea ya no está pendiente.");
  const [anio, mes] = l.fecha.split("-").map(Number);
  if ((await cierreDe(anio, mes)).firmado) throw badRequest("Ese mes ya está cerrado.");
  const banco = await prisma.bancoTesoreria.findUnique({ where: { id: e.bancoId } });
  let creado = null;
  if (accion === "registrar") {
    creado = await prisma.movimientoBanco.create({ data: {
      bancoId: e.bancoId, tipo: l.tipo, fecha: l.fecha, descripcion: limpiarTexto(l.descripcion, 300) || "(sin descripción)", valor: l.valor, moneda: banco?.moneda || "COP", tercero: limpiarTexto(l.tercero, 200),
      origen: "extracto", claveImportacion: l.clave, extractoId: e.id, verificadoAt: new Date(), verificadoPorNombre: `Extracto «${e.archivo}»`, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null,
    } }).catch((err) => { if (err.code === "P2002") throw badRequest("Esa línea ya está registrada."); throw err; });
  } else if (accion !== "descartar") throw badRequest("Acción inválida: registrar o descartar.");
  if (creado) publicarMovimientosRegistrados(creado.id, actor, `desde la conciliación (extracto «${e.archivo}»)`);
  await prisma.extractoBancario.update({ where: { id: e.id }, data: { pendientes: JSON.stringify(lista.filter((x) => x.clave !== clave)), ...(creado ? { nuevos: { increment: 1 } } : {}) } });
  logTesoreria(actor, {
    action: accion === "registrar" ? "crear" : "descartar", entityType: "conciliacionTesoreria", recordId: creado?.id || e.id,
    recordInfo: `${accion === "registrar" ? "Registró" : "Descartó"} la línea del extracto «${e.archivo}»: ${l.fecha} ${l.descripcion}`,
    after: { movimiento: `${l.fecha} ${l.descripcion} ${fmtMoneda(l.tipo === "credito" ? l.valor : -l.valor, banco?.moneda || "COP")}`, accion: accion === "registrar" ? "Registrada desde la conciliación" : "Descartada (no se registra)" },
  }).catch(() => {});
  return { ok: true, movimientoId: creado?.id || null };
}
