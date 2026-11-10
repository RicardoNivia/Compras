import { prisma } from "@/lib/prisma";
import { mapasCatalogos, toClientMovimiento } from "@/lib/tesoreria/movimientos";
import { fmtMoneda } from "@/lib/tesoreria/comun";

// Tablas dinámicas de Tesorería, como las hojas del Excel:
//   «Ejecutado»          → Tipo (Egresos / Ingresos / Traslados) → Ítem → Concepto, mes a mes.
//   «Por medio de pago»  → Cuenta → Tipo → Ítem → Concepto, mes a mes.
// Valores con signo (egresos negativos, como en el Excel), sumados por el código; nunca se mezclan monedas (un árbol por
// código ISO 4217). Un traslado entre cuentas propias sale de una (−) y entra a la otra (+): por eso solo aparece si se
// pide (en «Ejecutado» suma cero; en «Por medio de pago» mueve el saldo de cada cuenta).
// detallePivote devuelve los movimientos de UNA celda (como el doble clic de Excel), con la misma lógica de grupos.

const num = (d) => (d == null ? 0 : Number(d));
const TIPO = { egreso: "Egresos", ingreso: "Ingresos", traslado: "Traslados entre cuentas" };
const ORDEN_TIPO = ["Egresos", "Ingresos", "Traslados entre cuentas"];
const cmp = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });

function nodo(nombre) {
  return { nombre, meses: Array(12).fill(0), total: 0, hijos: new Map() };
}
function sumar(n, mes, v) { n.meses[mes] += v; n.total += v; }
function aJson(n) {
  const hijos = [...n.hijos.values()];
  // Los tipos van en su orden (Egresos, Ingresos, Traslados), como en el Excel; lo demás, alfabético.
  const sonTipos = hijos.every((h) => ORDEN_TIPO.includes(h.nombre));
  hijos.sort((a, b) => (sonTipos ? ORDEN_TIPO.indexOf(a.nombre) - ORDEN_TIPO.indexOf(b.nombre) : cmp(a.nombre, b.nombre)));
  return { nombre: n.nombre, meses: n.meses.map((v) => Math.round(v * 100) / 100), total: Math.round(n.total * 100) / 100, hijos: hijos.map(aJson) };
}

// Movimientos que entran en la tabla y, de cada uno, sus «asientos»: la ruta de grupos en la que cae y su valor con signo.
async function asientos({ anio, vista = "ejecutado", estado = "", cuentaId, pagadorId, itemId, tipo, mesDesde, mesHasta, traslados = false }) {
  anio = Number(anio) || new Date().getFullYear();
  const md = Math.min(Math.max(Number(mesDesde) || 1, 1), 12);
  const mh = Math.min(Math.max(Number(mesHasta) || 12, md), 12);
  const where = { fecha: { gte: `${anio}-${String(md).padStart(2, "0")}-01`, lte: `${anio}-${String(mh).padStart(2, "0")}-31` } };
  if (estado === "ejecutado" || estado === "proyectado") where.estado = estado;
  if (pagadorId) where.pagadorId = Number(pagadorId);
  if (itemId) where.itemId = Number(itemId);
  // Un ítem o un tipo (ingreso/egreso) dejan fuera los traslados: no tienen ítem ni son ingreso o egreso.
  if (tipo === "ingreso" || tipo === "egreso") where.tipo = tipo;
  else if (!traslados || itemId) where.tipo = { not: "traslado" };
  const [movs, mapas] = await Promise.all([prisma.movimientoTesoreria.findMany({ where, include: { _count: { select: { lineas: true, soportes: true } } } }), mapasCatalogos()]);
  const cuenta = (id) => mapas.cuentas.get(id)?.nombre || "—";
  const filtroCuenta = cuentaId ? Number(cuentaId) : null;
  const out = [];
  for (const m of movs) {
    const v = num(m.valor);
    const lados = m.tipo === "traslado"
      ? [{ cuentaId: m.cuentaId, valor: -v, item: `Sale de ${cuenta(m.cuentaId)}`, concepto: `Hacia ${cuenta(m.cuentaDestinoId)}` }, { cuentaId: m.cuentaDestinoId, valor: v, item: `Entra a ${cuenta(m.cuentaDestinoId)}`, concepto: `Desde ${cuenta(m.cuentaId)}` }]
      : [{ cuentaId: m.cuentaId, valor: m.tipo === "egreso" ? -v : v, item: mapas.items.get(m.itemId)?.nombre || "Sin ítem", concepto: (m.conceptoId && mapas.conceptos.get(m.conceptoId)?.nombre) || m.concepto }];
    for (const a of lados) {
      if (filtroCuenta && a.cuentaId !== filtroCuenta) continue;
      const ruta = vista === "medio" ? [cuenta(a.cuentaId), TIPO[m.tipo], a.item, a.concepto] : [TIPO[m.tipo], a.item, a.concepto];
      out.push({ mov: m, mes: Number(m.fecha.slice(5, 7)) - 1, valor: a.valor, ruta });
    }
  }
  return { anio, md, mh, movs, mapas, asientos: out };
}

export async function pivote(params) {
  const vista = params.vista === "medio" ? "medio" : "ejecutado";
  const { anio, md, mh, movs, asientos: lista } = await asientos({ ...params, vista });
  const raices = new Map(); // moneda → nodo raíz
  for (const a of lista) {
    if (!raices.has(a.mov.moneda)) raices.set(a.mov.moneda, nodo(a.mov.moneda));
    let n = raices.get(a.mov.moneda);
    sumar(n, a.mes, a.valor);
    for (const nombre of a.ruta) {
      if (!n.hijos.has(nombre)) n.hijos.set(nombre, nodo(nombre));
      n = n.hijos.get(nombre);
      sumar(n, a.mes, a.valor);
    }
  }
  const monedas = [...raices.keys()].sort((a, b) => (a === "COP" ? -1 : b === "COP" ? 1 : a.localeCompare(b)));
  return {
    anio, vista, estado: params.estado || "todos", traslados: !!params.traslados && !params.itemId && !params.tipo, mesDesde: md, mesHasta: mh,
    niveles: vista === "medio" ? ["Medio de pago", "Tipo", "Ítem", "Concepto"] : ["Tipo", "Ítem", "Concepto"],
    porMoneda: monedas.map((moneda) => ({ moneda, ...aJson(raices.get(moneda)) })),
    movimientos: movs.length,
  };
}

// Los movimientos de una celda: moneda + ruta de grupos (de 0 a todos los niveles; vacía = total general) + mes (0-11,
// o null = la columna Total). Con los mismos filtros de la tabla, así la suma coincide con la cifra en la que se hizo clic.
export async function detallePivote(params, { moneda, ruta = [], mes = null, page = 1, size = 10 }) {
  const vista = params.vista === "medio" ? "medio" : "ejecutado";
  const { mapas, asientos: lista } = await asientos({ ...params, vista });
  const elegidos = lista.filter((a) => a.mov.moneda === moneda && (mes == null || a.mes === Number(mes)) && ruta.every((r, i) => a.ruta[i] === r));
  elegidos.sort((a, b) => b.mov.fecha.localeCompare(a.mov.fecha) || b.mov.id - a.mov.id);
  const total = elegidos.reduce((s, a) => s + a.valor, 0);
  size = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 10;
  const paginas = Math.max(1, Math.ceil(elegidos.length / size));
  page = Math.min(Math.max(1, Number(page) || 1), paginas);
  return {
    moneda, ruta, mes: mes == null ? null : Number(mes),
    total, totalTexto: fmtMoneda(total, moneda), cantidad: elegidos.length, page, size,
    items: elegidos.slice((page - 1) * size, page * size).map((a) => ({ ...toClientMovimiento(a.mov, mapas), valorConSigno: a.valor, valorConSignoTexto: fmtMoneda(a.valor, moneda) })),
  };
}
