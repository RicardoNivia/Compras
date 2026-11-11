import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { badRequest, numero, fmtMoneda, redondear } from "@/lib/tesoreria/comun";

// Saldos de los bancos. Punto de partida: el saldo inicial de enero que digita la persona (o, si falta, el saldo final de
// diciembre anterior que reportó el banco). Cada saldo que reporta el banco (extracto mensual o parcial, filas SALDO de la
// plantilla) es un ANCLA: desde ese día el saldo sigue al del banco más los movimientos posteriores, así los saldos se
// ajustan solos a medida que se suben extractos. La diferencia del mes compara lo registrado con lo que dijo el banco.

const num = (d) => (d == null ? 0 : Number(d));

export async function saldosIniciales(anio) {
  anio = Number(anio) || Number(hoyColombia().slice(0, 4));
  const [bancos, saldos] = await Promise.all([
    prisma.bancoTesoreria.findMany({ orderBy: { nombre: "asc" } }),
    prisma.saldoInicialBanco.findMany({ where: { anio } }),
  ]);
  const por = new Map(saldos.map((s) => [s.bancoId, s]));
  return {
    anio,
    items: bancos.map((b) => {
      const s = por.get(b.id);
      return { bancoId: b.id, banco: b.nombre, moneda: b.moneda, activo: b.activo, valor: s ? num(s.valor) : null, valorTexto: s ? fmtMoneda(s.valor, b.moneda) : null, actualizadoPor: s?.creadoPorNombre || null, updatedAt: s?.updatedAt || null };
    }),
  };
}

export async function guardarSaldoInicial(actor, { bancoId, anio, valor }) {
  anio = Number(anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw badRequest("Año inválido.");
  const banco = await prisma.bancoTesoreria.findUnique({ where: { id: Number(bancoId) || 0 } });
  if (!banco) throw badRequest("El banco no existe.");
  const antes = await prisma.saldoInicialBanco.findUnique({ where: { bancoId_anio: { bancoId: banco.id, anio } } });
  let s = null;
  if (valor === null || valor === "") {
    if (antes) await prisma.saldoInicialBanco.delete({ where: { id: antes.id } });
  } else {
    const v = numero(valor, "El saldo inicial");
    s = await prisma.saldoInicialBanco.upsert({
      where: { bancoId_anio: { bancoId: banco.id, anio } },
      update: { valor: v, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null },
      create: { bancoId: banco.id, anio, valor: v, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null },
    });
  }
  // La alerta «registra el saldo inicial» de ese banco y año ya no aplica.
  if (s) await prisma.alertaTesoreria.updateMany({ where: { tipo: "saldoInicial", refTipo: "banco", refId: banco.id, clave: { startsWith: `saldo|${anio}|` }, resuelta: false }, data: { resuelta: true, resueltaPorNombre: actor.nombre || null, resueltaAt: new Date() } }).catch(() => {});
  logTesoreria(actor, {
    action: antes ? (s ? "editar" : "eliminar") : "crear", entityType: "saldoTesoreria", recordId: `${banco.id}-${anio}`,
    recordInfo: `Saldo inicial de ${banco.nombre} en ${anio}`,
    before: antes ? { banco: banco.nombre, anio, valor: fmtMoneda(antes.valor, banco.moneda) } : null,
    after: s ? { banco: banco.nombre, anio, valor: fmtMoneda(s.valor, banco.moneda) } : null,
  }).catch(() => {});
  return { ok: true };
}

const ultimoDia = (anio, mes) => `${anio}-${String(mes).padStart(2, "0")}-${String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, "0")}`;
const diaAntes = (f) => new Date(Date.parse(`${f}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

// Saldo de cada banco mes a mes en un año (y al día de hoy si es el año en curso), anclado a los saldos del banco.
// Un ancla es { dia, valor }: el saldo al CIERRE de ese día. Saldo final reportado → cierre de su fecha (o del último
// día del mes); saldo inicial reportado → cierre del día anterior; saldo inicial digitado → cierre del 31 de diciembre.
// bancoId (opcional): solo ese banco (Conciliación). dias (opcional): devuelve el saldo al cierre de esos días en
// saldosEn (el análisis de un extracto compara su saldo inicial y final con estos).
export async function reporteSaldos(anio, { bancoId = null, dias: diasPedidos = [] } = {}) {
  anio = Number(anio) || Number(hoyColombia().slice(0, 4));
  const hoy = hoyColombia();
  const [bancos, iniciales, reportados, movs] = await Promise.all([
    prisma.bancoTesoreria.findMany({ where: bancoId ? { id: bancoId } : {}, orderBy: { nombre: "asc" } }),
    prisma.saldoInicialBanco.findMany({ where: { anio, ...(bancoId ? { bancoId } : {}) } }),
    prisma.saldoReportadoBanco.findMany({ where: { ...(bancoId ? { bancoId } : {}), OR: [{ anio }, { anio: anio - 1, mes: 12, tipo: "final" }] } }),
    prisma.movimientoBanco.groupBy({ by: ["bancoId", "tipo", "fecha"], where: { ...(bancoId ? { bancoId } : {}), fecha: { gte: `${anio}-01-01`, lte: `${anio}-12-31` } }, _sum: { valor: true }, _count: { _all: true } }),
  ]);
  const ini = new Map(iniciales.map((s) => [s.bancoId, num(s.valor)]));
  const cierreAnterior = `${anio - 1}-12-31`;

  const items = bancos.map((b) => {
    // Neto de cada día (créditos − débitos) y totales por mes.
    const netoDia = new Map();
    const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, creditos: 0, debitos: 0, movimientos: 0 }));
    for (const g of movs.filter((x) => x.bancoId === b.id)) {
      const v = num(g._sum.valor);
      const m = meses[Number(g.fecha.slice(5, 7)) - 1];
      if (g.tipo === "credito") m.creditos += v; else m.debitos += v;
      m.movimientos += g._count._all;
      netoDia.set(g.fecha, (netoDia.get(g.fecha) || 0) + (g.tipo === "credito" ? v : -v));
    }
    const dias = [...netoDia.keys()].sort();
    const netoEntre = (desde, hasta) => dias.reduce((s, d) => (d > desde && d <= hasta ? s + netoDia.get(d) : s), 0); // (desde, hasta]

    // Anclas: lo digitado y lo que reportó el banco.
    const anclas = [];
    const repBanco = reportados.filter((r) => r.bancoId === b.id);
    for (const r of repBanco) {
      if (r.tipo === "final") anclas.push({ dia: r.fecha || ultimoDia(r.anio, r.mes), valor: num(r.valor), fuente: "banco", tipo: "final", texto: r.texto });
      else if (r.anio === anio) anclas.push({ dia: diaAntes(r.fecha || `${r.anio}-${String(r.mes).padStart(2, "0")}-01`), valor: num(r.valor), fuente: "banco", tipo: "inicial", texto: r.texto });
    }
    const digitado = ini.has(b.id) ? ini.get(b.id) : null;
    if (digitado != null) anclas.push({ dia: cierreAnterior, valor: digitado, fuente: "digitado" });
    // En el mismo día manda el banco sobre lo digitado.
    anclas.sort((x, y) => (x.dia < y.dia ? -1 : x.dia > y.dia ? 1 : x.fuente === "banco" ? 1 : -1));

    // Saldo al cierre de un día: desde la última ancla anterior (o igual); si no hay, hacia atrás desde la primera posterior.
    // antesDe: solo anclas de días anteriores; sinInicialDesde: ignora los saldos INICIALES que reportó el banco desde ese
    // día (para comparar el saldo con el que arranca el mes contra el que dice el extracto).
    const saldoAl = (dia, { antesDe = null, sinInicialDesde = null } = {}) => {
      const validas = anclas.filter((a) => (!antesDe || a.dia < antesDe) && (!sinInicialDesde || a.tipo !== "inicial" || a.dia < sinInicialDesde));
      if (sinInicialDesde) { const previa = [...validas].reverse().find((a) => a.dia <= dia); return previa ? { valor: previa.valor + netoEntre(previa.dia, dia), ancla: previa } : null; }
      const previa = [...validas].reverse().find((a) => a.dia <= dia);
      if (previa) return { valor: previa.valor + netoEntre(previa.dia, dia), ancla: previa };
      if (antesDe) return null;
      const siguiente = anclas.find((a) => a.dia > dia);
      if (siguiente) return { valor: siguiente.valor - netoEntre(dia, siguiente.dia), ancla: siguiente };
      return null;
    };

    const inicialAnio = saldoAl(cierreAnterior);
    for (const m of meses) {
      const primero = `${anio}-${String(m.mes).padStart(2, "0")}-01`;
      const fin = ultimoDia(anio, m.mes);
      m.creditos = redondear(m.creditos);
      m.debitos = redondear(m.debitos);
      const si = saldoAl(diaAntes(primero));
      const sf = saldoAl(fin);
      m.saldoInicial = si ? redondear(si.valor) : null;
      // Con lo que venía del mes anterior (sin el saldo inicial que trae el extracto de este mes).
      const sp = saldoAl(diaAntes(primero), { sinInicialDesde: diaAntes(primero) });
      m.saldoInicialPrevio = sp ? redondear(sp.valor) : null;
      // De dónde sale el saldo con que empieza el mes: extracto del banco (su saldo final del mes anterior o su saldo
      // inicial), el saldo inicial digitado, o estimado (calculado desde otro saldo con los movimientos registrados).
      m.inicioFuente = !si ? null : si.ancla.fuente === "digitado" && si.ancla.dia === diaAntes(primero) ? "digitado" : si.ancla.fuente === "banco" && si.ancla.dia === diaAntes(primero) ? "extracto" : "estimado";
      m.inicioDesde = si && si.ancla.dia !== diaAntes(primero) ? si.ancla.dia : null;
      m.saldoFinal = sf ? redondear(sf.valor) : null;
      // Lo que reportó el banco ese mes (el más reciente) y lo que daba lo registrado SIN usar ese saldo.
      const delMes = anclas.filter((a) => a.fuente === "banco" && a.dia >= primero && a.dia <= fin && repBanco.some((r) => r.tipo === "final" && (r.fecha || ultimoDia(r.anio, r.mes)) === a.dia));
      const rep = delMes.at(-1) || null;
      m.reportado = rep ? redondear(rep.valor) : null;
      m.reportadoAl = rep && rep.dia !== fin ? rep.dia : null; // extracto parcial: hasta ese día
      const calc = rep ? saldoAl(rep.dia, { antesDe: rep.dia }) : null;
      m.calculado = calc ? redondear(calc.valor) : null;
      m.diferencia = rep && calc ? redondear(calc.valor - rep.valor) : null;
      // Del banco solo si el saldo sale de un ancla DENTRO del mes y no posterior (lo calculado hacia atrás desde un
      // extracto más nuevo es «calculado»).
      m.fuente = !sf ? null : sf.ancla.fuente === "banco" && sf.ancla.dia >= primero && sf.ancla.dia <= fin ? (sf.ancla.dia === fin ? "banco" : "parcial") : "calculado";
      // Estado del mes para la pantalla: confirmado (extracto de fin de mes y cuadra), diferencia (hay extracto y no
      // cuadra), parcial (extracto hasta un día del mes), estimado (sin extracto) o sinDatos.
      m.estado = primero > hoy ? "futuro" : m.reportado != null && m.diferencia != null && Math.abs(m.diferencia) > 0.5 ? "diferencia"
        : m.fuente === "banco" ? "confirmado" : m.fuente === "parcial" ? "parcial" : m.saldoFinal != null && (m.movimientos || m.saldoInicial != null) ? "estimado" : "sinDatos";
    }
    const finAnio = saldoAl(`${anio}-12-31`);
    const aHoy = anio === Number(hoy.slice(0, 4)) ? saldoAl(hoy) : null;
    const ultimoBanco = anclas.filter((a) => a.fuente === "banco" && a.dia <= `${anio}-12-31`).at(-1) || null;
    return {
      bancoId: b.id, banco: b.nombre, moneda: b.moneda, activo: b.activo,
      saldoInicial: inicialAnio ? redondear(inicialAnio.valor) : null,
      saldoInicialDigitado: digitado,
      // digitado | banco (saldo de diciembre que reportó el banco) | calculado (hacia atrás desde un extracto posterior)
      fuenteInicial: digitado != null ? "digitado" : !inicialAnio ? null : inicialAnio.ancla.dia <= cierreAnterior ? "banco" : "calculado",
      inicialDesde: inicialAnio && digitado == null && inicialAnio.ancla.dia > cierreAnterior ? inicialAnio.ancla.dia : null,
      saldosEn: Object.fromEntries(diasPedidos.map((x) => { const v = saldoAl(x); return [x, v ? redondear(v.valor) : null]; })),
      creditos: redondear(meses.reduce((s, m) => s + m.creditos, 0)), debitos: redondear(meses.reduce((s, m) => s + m.debitos, 0)),
      saldoFinal: finAnio ? redondear(finAnio.valor) : null,
      saldoHoy: aHoy ? redondear(aHoy.valor) : null,
      ultimoSaldoBanco: ultimoBanco ? { dia: ultimoBanco.dia, valor: redondear(ultimoBanco.valor), texto: ultimoBanco.texto || null } : null,
      meses,
    };
  });
  return { anio, hoy, items };
}
