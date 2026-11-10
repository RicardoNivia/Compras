import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { leerExtracto, patronDe, fechaDeCelda, valorDeCelda } from "./parsersExtracto.js";
import { emparejar } from "./emparejar.js";

// Carga de la plantilla Excel de flujo de caja a Tesorería (núcleo con imports relativos: lo usan la app —
// lib/tesoreria/importarExcelApp.js, con Nova y auditoría— y scripts/tesoreria/importarFlujoCaja.mjs).
//
// 1) analizarLibro(buffer, { mapeo }) lee el libro SIN escribir nada y devuelve el plan:
//    · La hoja del libro (detalle de movimientos) y sus columnas: se reconocen por los encabezados; si no, la app le
//      pide a Nova el mapeo (hoja, fila de encabezados, columna de cada campo y qué significa cada código) y lo vuelve
//      a pasar aquí; el código lo valida.
//    · Maestros: cuentas (medio de pago), ítems, conceptos y pagadores, unificando lo escrito distinto.
//    · Saldos iniciales (tipo S), movimientos (fecha exacta si hay columna de fecha; si no, día 1 con fecha
//      aproximada), traslados entre cuentas propias emparejados (salida + entrada del mismo valor y mes).
//    · Extractos: las demás hojas con formato de extracto (tipo AV Villas o tipo Credicorp), cada una asignada a la
//      cuenta cuyos movimientos coinciden con más líneas; reglas aprendidas de las etiquetas puestas a mano.
//    · Cada fila lleva una huella (claveImportacion, sin el estado): volver a importar no duplica y un proyectado
//      que en la nueva versión ya está ejecutado se actualiza.
// 2) aplicarPlan(prisma, plan, { modo, creador }) escribe: "agregar" (agrega lo nuevo y actualiza estados) o
//    "reemplazar" (borra antes todo lo de Tesorería; la app solo lo permite a quien firma).

const DANADO = String.fromCharCode(65533);
const quitarTildes = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "");
export const norm = (s) => quitarTildes(s).toLowerCase().replace(/\s+/g, " ").trim();
const limpio = (s) => (s == null ? null : String(s).split(DANADO).join("").replace(/\s+/g, " ").trim() || null);
const clave = (s) => norm(s).replace(/s$/, "");
const huella = (...p) => createHash("sha1").update(p.map((x) => String(x ?? "")).join("|")).digest("hex");

// ---------- Encabezados del libro ----------

export const CAMPOS = {
  item: { obligatorio: false, alias: [/^item$/, /^centro/, /^inmueble/, /^proyecto/] },
  tipo: { obligatorio: true, alias: [/ingreso\s*\/?\s*egreso/, /^tipo$/, /^tipo de mov/, /^naturaleza/] },
  estado: { obligatorio: false, alias: [/^estado$/] },
  concepto: { obligatorio: true, alias: [/^concepto$/, /^descripcion$/, /^detalle$/] },
  medio: { obligatorio: true, alias: [/^medio de pago$/, /^cuenta$/, /^banco$/, /^medio$/] },
  paga: { obligatorio: false, alias: [/^paga$/, /^pagador$/, /quien paga/, /^responsable$/] },
  anio: { obligatorio: false, alias: [/^ano$/, /^anio$/, /^year$/] },
  mes: { obligatorio: false, alias: [/^mes$/, /^periodo$/] },
  fecha: { obligatorio: false, alias: [/^fecha$/, /^fecha de pago$/, /^fecha mov/] },
  valor: { obligatorio: true, alias: [/^valor$/, /^monto$/, /^importe$/, /^total$/] },
};

// Busca la hoja y la fila de encabezados con los campos obligatorios (y mes o fecha).
function detectarLibro(wb) {
  for (const hoja of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null, blankrows: false });
    for (let i = 0; i < Math.min(filas.length, 15); i++) {
      const cab = (filas[i] || []).map((c) => norm(c));
      const columnas = {};
      for (const [campo, def] of Object.entries(CAMPOS)) {
        const j = cab.findIndex((c) => c && def.alias.some((a) => a.test(c)));
        if (j >= 0 && !Object.values(columnas).includes(j)) columnas[campo] = j;
      }
      const tiene = Object.entries(CAMPOS).filter(([, d]) => d.obligatorio).every(([c]) => columnas[c] !== undefined) && (columnas.mes !== undefined || columnas.fecha !== undefined);
      if (tiene) return { hoja, filaEncabezado: i, columnas, origen: "automatico" };
    }
  }
  return null;
}

// Muestra de cada hoja para que Nova decida el mapeo cuando los encabezados no se reconocen.
export function muestraDeHojas(buffer, max = 8) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  return wb.SheetNames.slice(0, 12).map((hoja) => {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: false, defval: "", blankrows: false });
    return { hoja, filas: filas.slice(0, max).map((f) => f.slice(0, 20).map((c) => String(c).slice(0, 40))) };
  });
}

// Códigos de tipo y estado (I/E/J/S/T, E/P o palabras). El mapeo de Nova puede traer los de la plantilla.
function tipoDeCodigo(v, codigos) {
  const t = norm(v);
  for (const [tipo, lista] of Object.entries(codigos || {})) if ((lista || []).some((c) => norm(c) === t)) return tipo;
  if (["i", "ingreso", "ingresos", "entrada", "j", "nomina"].includes(t)) return "ingreso";
  if (["e", "egreso", "egresos", "salida", "gasto"].includes(t)) return "egreso";
  if (["s", "saldo", "saldo inicial"].includes(t)) return "saldo";
  if (["t", "traslado", "transferencia propia"].includes(t)) return "traslado";
  return null;
}
function estadoDeCodigo(v, codigos) {
  const t = norm(v);
  if ((codigos?.proyectado || []).some((c) => norm(c) === t)) return "proyectado";
  if ((codigos?.ejecutado || []).some((c) => norm(c) === t)) return "ejecutado";
  if (["p", "proyectado", "pendiente", "planeado", "presupuestado"].includes(t)) return "proyectado";
  return "ejecutado"; // E, ejecutado, pagado o vacío
}

// El nombre más usado de cada grupo escrito distinto.
function canonicos(valores) {
  const grupos = new Map();
  for (const v of valores.filter(Boolean)) {
    const k = clave(v);
    if (!grupos.has(k)) grupos.set(k, new Map());
    grupos.get(k).set(v, (grupos.get(k).get(v) || 0) + 1);
  }
  const out = new Map();
  for (const [k, m] of grupos) out.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

function tipoDeCuenta(k) {
  if (/tarjeta/.test(k)) return { tipo: "tarjeta", nombre: "Tarjeta de crédito" };
  if (/efectivo|caja/.test(k)) return { tipo: "efectivo" };
  if (/^snc$/.test(k)) return { tipo: "otro" };
  return { tipo: "ahorros" };
}

const fechaMes = (anio, mes) => `${anio}-${String(mes).padStart(2, "0")}-01`;

export function analizarLibro(buffer, { mapeo = null, anioPorDefecto = new Date().getFullYear() } = {}) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const libro = mapeo
    ? { hoja: mapeo.hoja, filaEncabezado: Number(mapeo.filaEncabezado) || 0, columnas: mapeo.columnas || {}, origen: "nova" }
    : detectarLibro(wb);
  if (!libro || !wb.Sheets[libro.hoja]) return { reconocido: false };
  const faltan = Object.entries(CAMPOS).filter(([c, d]) => d.obligatorio && libro.columnas[c] === undefined).map(([c]) => c);
  if (faltan.length || (libro.columnas.mes === undefined && libro.columnas.fecha === undefined)) return { reconocido: false, faltan };

  const avisos = [];
  const crudas = XLSX.utils.sheet_to_json(wb.Sheets[libro.hoja], { header: 1, raw: true, defval: null, blankrows: false }).slice(libro.filaEncabezado + 1);
  const col = (f, campo) => (libro.columnas[campo] === undefined ? null : f[libro.columnas[campo]]);
  const desconocidos = new Map();
  const filas = [];
  crudas.forEach((f, i) => {
    const valorCrudo = valorDeCelda(col(f, "valor"));
    const tipo = tipoDeCodigo(col(f, "tipo"), mapeo?.codigosTipo);
    if (valorCrudo == null && !col(f, "concepto")) return; // fila vacía
    if (!tipo) { const t = String(col(f, "tipo") ?? "(vacío)"); desconocidos.set(t, (desconocidos.get(t) || 0) + 1); return; }
    const fecha = libro.columnas.fecha !== undefined ? fechaDeCelda(col(f, "fecha")) : null;
    const anio = Number(col(f, "anio")) || (fecha ? Number(fecha.slice(0, 4)) : anioPorDefecto);
    const mes = Number(col(f, "mes")) || (fecha ? Number(fecha.slice(5, 7)) : 0);
    if (!(mes >= 1 && mes <= 12) || !(anio >= 2000 && anio <= 2100)) return;
    filas.push({
      fila: libro.filaEncabezado + i + 2, item: limpio(col(f, "item")), tipo, estado: estadoDeCodigo(col(f, "estado"), mapeo?.codigosEstado),
      concepto: limpio(col(f, "concepto")), medio: limpio(col(f, "medio")), paga: limpio(col(f, "paga")),
      anio, mes, fecha, valor: valorCrudo || 0, signo: Math.sign(valorCrudo || 0),
    });
  });
  if (desconocidos.size) avisos.push(`Filas con un tipo que no reconozco (se omitieron): ${[...desconocidos].map(([t, n]) => `«${t}» ×${n}`).join(", ")}.`);
  const enCero = filas.filter((f) => !f.valor).length;
  const conValor = filas.filter((f) => f.valor);

  const nombresCuenta = canonicos(conValor.map((f) => f.medio));
  const cuentas = [...nombresCuenta.entries()].map(([k, nombre]) => ({ k, nombre, ...tipoDeCuenta(k), moneda: "COP", formatoExtracto: null }));
  const cuentaDeTexto = (t) => {
    const n = norm(t).replace(/[^a-z0-9 ]/g, " ");
    return cuentas.find((c) => n.includes(c.k) || n.includes(norm(c.nombre)) || (c.k.length >= 6 && n.includes(c.k.slice(0, -1)))) || null;
  };
  const esTraslado = (f) => f.tipo === "traslado" || /^tra[n]?slado/.test(norm(f.item)) || /^tra[n]?slado/.test(norm(f.concepto));
  const operativas = conValor.filter((f) => f.tipo !== "saldo" && !esTraslado(f));
  const nombresItem = canonicos(operativas.map((f) => f.item));
  const nombresPagador = canonicos(conValor.map((f) => f.paga));
  const nombresConcepto = canonicos(operativas.map((f) => f.concepto));
  const itemDeConcepto = new Map();
  for (const [k] of nombresConcepto) {
    const conteo = new Map();
    for (const f of operativas.filter((x) => clave(x.concepto) === k)) conteo.set(clave(f.item), (conteo.get(clave(f.item)) || 0) + 1);
    itemDeConcepto.set(k, [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null);
  }

  // Saldos iniciales (tipo S), a la fecha del primer mes que traen.
  const saldos = new Map();
  for (const f of conValor.filter((x) => x.tipo === "saldo")) {
    const c = cuentaDeTexto(f.medio);
    if (!c) continue;
    const prev = saldos.get(c.k);
    saldos.set(c.k, { valor: (prev?.valor || 0) + Math.abs(f.valor), fecha: prev?.fecha && prev.fecha < fechaMes(f.anio, f.mes) ? prev.fecha : fechaMes(f.anio, f.mes) });
  }

  // Huella de cada fila (sin el estado, para poder actualizarlo); la ocurrencia separa filas idénticas.
  const vistas = new Map();
  const conHuella = (base) => { const n = (vistas.get(base) || 0) + 1; vistas.set(base, n); return huella(base, n); };

  const movs = operativas.map((f) => ({
    fila: f.fila, tipo: f.tipo === "egreso" ? "egreso" : "ingreso", estado: f.estado,
    fecha: f.fecha || fechaMes(f.anio, f.mes), fechaAproximada: !f.fecha, valor: Math.abs(f.valor),
    cuentaK: clave(f.medio), itemK: clave(f.item), conceptoK: clave(f.concepto), pagadorK: clave(f.paga),
    claveImportacion: conHuella(["M", f.anio, f.mes, f.fecha || "", clave(f.item), clave(f.concepto), clave(f.medio), clave(f.paga), f.tipo === "egreso" ? "e" : "i", Math.round(Math.abs(f.valor) * 100)].join("|")),
  }));

  // Traslados: salida + entrada del mismo valor y mes; lo suelto toma la otra cuenta del texto del concepto.
  const tras = conValor.filter((f) => f.tipo !== "saldo" && esTraslado(f)).map((f) => ({ ...f, neg: f.signo < 0 || f.tipo === "egreso", usado: false, cuenta: cuentaDeTexto(f.medio), otra: cuentaDeTexto(f.concepto) }));
  const traslados = [];
  const sinPareja = [];
  for (const s of tras.filter((t) => t.neg)) {
    const e = tras.find((t) => !t.usado && !t.neg && t.mes === s.mes && t.anio === s.anio && Math.abs(Math.abs(t.valor) - Math.abs(s.valor)) < 0.5 && t.cuenta?.k !== s.cuenta?.k);
    if (e) { e.usado = true; s.usado = true; traslados.push({ origen: s.cuenta, destino: e.cuenta, valor: Math.abs(s.valor), anio: s.anio, mes: s.mes, fecha: s.fecha, estado: s.estado, texto: `${s.concepto} / ${e.concepto}`, filas: [s.fila, e.fila] }); }
  }
  for (const t of tras.filter((x) => !x.usado)) {
    const origen = t.neg ? t.cuenta : t.otra;
    const destino = t.neg ? t.otra : t.cuenta;
    if (origen && destino && origen.k !== destino.k) traslados.push({ origen, destino, valor: Math.abs(t.valor), anio: t.anio, mes: t.mes, fecha: t.fecha, estado: t.estado, texto: t.concepto, filas: [t.fila] });
    else sinPareja.push(t);
  }
  for (const t of traslados) t.claveImportacion = conHuella(["T", t.anio, t.mes, t.fecha || "", t.origen?.k, t.destino?.k, Math.round(t.valor * 100)].join("|"));
  const conceptoSuelto = "Traslado sin cuenta identificada";
  for (const t of sinPareja) {
    movs.push({
      fila: t.fila, tipo: t.neg ? "egreso" : "ingreso", estado: t.estado, fecha: t.fecha || fechaMes(t.anio, t.mes), fechaAproximada: !t.fecha, valor: Math.abs(t.valor),
      cuentaK: clave(t.medio), itemK: clave(t.item), conceptoK: clave(conceptoSuelto), pagadorK: clave(t.paga),
      claveImportacion: conHuella(["S", t.anio, t.mes, t.fecha || "", clave(t.medio), t.neg ? "e" : "i", Math.round(Math.abs(t.valor) * 100)].join("|")),
    });
    if (!nombresConcepto.has(clave(conceptoSuelto))) nombresConcepto.set(clave(conceptoSuelto), conceptoSuelto);
    if (t.item && !nombresItem.has(clave(t.item))) nombresItem.set(clave(t.item), t.item);
  }
  if (sinPareja.length) avisos.push(`${sinPareja.length} traslado(s) sin la otra cuenta: se cargan como ingreso o egreso con el concepto «${conceptoSuelto}».`);

  // Extractos: las demás hojas con formato de extracto, solo los años que trae el libro.
  const anios = new Set(conValor.map((f) => f.anio));
  const hojaComoLibro = (nombre) => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, wb.Sheets[nombre], "extracto"); return XLSX.write(w, { type: "buffer", bookType: "xlsx" }); };
  const signoMov = (m) => (m.tipo === "egreso" ? -m.valor : m.valor);
  const extractos = [];
  for (const hoja of wb.SheetNames.filter((n) => n !== libro.hoja)) {
    let leido = null;
    for (const formato of ["avvillas", "credicorp"]) {
      const r = leerExtracto(hojaComoLibro(hoja), formato);
      if (r.formato === formato && r.lineas.length) { leido = r; break; }
    }
    if (!leido) continue;
    const delPeriodo = leido.lineas.filter((l) => anios.has(Number(l.fecha.slice(0, 4))));
    const puntaje = cuentas.map((c) => {
      const ms = movs.filter((m) => m.cuentaK === c.k);
      return { c, n: delPeriodo.filter((l) => ms.some((m) => m.fecha.slice(0, 7) === l.fecha.slice(0, 7) && Math.abs(signoMov(m) - l.valor) < 0.5)).length };
    }).sort((a, b) => b.n - a.n);
    const ya = new Set(extractos.map((e) => e.cuenta.k));
    const elegido = puntaje.find((p) => !ya.has(p.c.k) && p.n > 0);
    if (!elegido) { avisos.push(`La hoja «${hoja.trim()}» parece un extracto, pero no pude saber de qué cuenta es: se omite.`); continue; }
    elegido.c.formatoExtracto = leido.formato;
    extractos.push({ hoja: hoja.trim(), cuentaK: elegido.c.k, cuenta: elegido.c.nombre, formato: leido.formato, lineas: delPeriodo, total: leido.lineas.length, coincidencias: elegido.n, etiquetas: leido.lineas });
  }

  return {
    reconocido: true,
    libro: { hoja: libro.hoja, filaEncabezado: libro.filaEncabezado, columnas: libro.columnas, origen: libro.origen },
    anios: [...anios].sort(), filas: filas.length, enCero, avisos,
    cuentas, items: [...nombresItem.entries()], conceptos: [...nombresConcepto.entries()], pagadores: [...nombresPagador.entries()],
    itemDeConcepto: [...itemDeConcepto.entries()],
    saldos: [...saldos.entries()].map(([k, s]) => ({ cuentaK: k, cuenta: cuentas.find((c) => c.k === k)?.nombre, ...s })),
    movimientos: movs,
    traslados: traslados.map((t) => ({ ...t, origen: t.origen.k, destino: t.destino.k, origenNombre: t.origen.nombre, destinoNombre: t.destino.nombre })),
    extractos,
  };
}

// Resumen del plan para mostrar (sin las filas).
export function resumenPlan(plan, existentes = null) {
  const nuevos = (lista, set) => (set ? lista.filter(([k]) => !set.has(k)) : lista).map(([, n]) => n);
  return {
    libro: plan.libro, anios: plan.anios, filas: plan.filas, enCero: plan.enCero, avisos: plan.avisos,
    movimientos: plan.movimientos.length, proyectados: plan.movimientos.filter((m) => m.estado === "proyectado").length,
    fechaAproximada: plan.movimientos.every((m) => m.fechaAproximada),
    traslados: plan.traslados.length,
    maestros: {
      cuentas: { total: plan.cuentas.length, nuevos: nuevos(plan.cuentas.map((c) => [clave(c.nombre), c.nombre]), existentes?.cuentas) },
      items: { total: plan.items.length, nuevos: nuevos(plan.items, existentes?.items) },
      conceptos: { total: plan.conceptos.length, nuevos: nuevos(plan.conceptos, existentes?.conceptos) },
      pagadores: { total: plan.pagadores.length, nuevos: nuevos(plan.pagadores, existentes?.pagadores) },
    },
    saldos: plan.saldos.map((s) => ({ cuenta: s.cuenta, valor: s.valor, fecha: s.fecha })),
    extractos: plan.extractos.map((e) => ({ hoja: e.hoja, cuenta: e.cuenta, formato: e.formato, lineas: e.lineas.length, total: e.total, coincidencias: e.coincidencias })),
  };
}

// Claves de lo que ya existe (para decir qué maestros son nuevos).
export async function clavesExistentes(prisma) {
  const [c, i, k, p] = await Promise.all([prisma.cuentaTesoreria.findMany(), prisma.itemTesoreria.findMany(), prisma.conceptoTesoreria.findMany(), prisma.pagadorTesoreria.findMany()]);
  return { cuentas: new Set(c.map((x) => clave(x.nombre))), items: new Set(i.map((x) => clave(x.nombre))), conceptos: new Set(k.map((x) => clave(x.nombre))), pagadores: new Set(p.map((x) => clave(x.nombre))) };
}

// ---------- Aplicar ----------

async function porClave(modelo, lista, crear) {
  const existentes = await modelo.findMany();
  const porNombre = new Map(existentes.map((x) => [clave(x.nombre), x.id]));
  const mapa = new Map(porNombre);
  for (const [k, nombre] of lista) {
    if (mapa.has(k)) continue;
    if (porNombre.has(clave(nombre))) { mapa.set(k, porNombre.get(clave(nombre))); continue; }
    const fila = await modelo.create({ data: crear(k, nombre) });
    mapa.set(k, fila.id);
  }
  return mapa;
}

export async function aplicarPlan(prisma, plan, { modo = "agregar", creador = { nombre: "Importación Excel" }, archivo = "plantilla.xlsx" } = {}) {
  const CREADOR = { creadoPorUserId: creador.id || null, creadoPorNombre: creador.nombre || "Importación Excel" };
  // Movimientos importados antes de que existiera la huella: «agregar» no los reconocería y los duplicaría.
  if (modo !== "reemplazar" && (await prisma.movimientoTesoreria.count({ where: { origen: "importacion", claveImportacion: null } }))) {
    throw Object.assign(new Error("Hay movimientos importados antes de que la carga marcara cada fila: si agrego, se duplicarían. Usa «Reemplazar todo» una vez; desde ahí, volver a importar ya no duplica."), { status: 400 });
  }
  if (modo === "reemplazar") {
    await prisma.$transaction([
      prisma.lineaExtracto.deleteMany(), prisma.extractoBancario.deleteMany(), prisma.soporteMovimiento.deleteMany(), prisma.movimientoTesoreria.deleteMany(),
      prisma.recurrenciaTesoreria.deleteMany(), prisma.reglaClasificacion.deleteMany(), prisma.cierreMes.deleteMany(), prisma.conceptoTesoreria.deleteMany(),
      prisma.itemTesoreria.deleteMany(), prisma.pagadorTesoreria.deleteMany(), prisma.cuentaTesoreria.deleteMany(),
    ]);
  }
  const firmados = new Set((await prisma.cierreMes.findMany({ select: { anio: true, mes: true } })).map((c) => `${c.anio}-${String(c.mes).padStart(2, "0")}`));
  const abierto = (fecha) => !firmados.has(fecha.slice(0, 7));

  // Maestros: se reutiliza lo que ya existe escrito igual o parecido (sin tildes, mayúsculas ni la s final).
  const saldoDe = new Map(plan.saldos.map((s) => [s.cuentaK, s]));
  const idCuenta = await porClave(prisma.cuentaTesoreria, plan.cuentas.map((c) => [c.k, c.nombre]), (k, nombre) => {
    const c = plan.cuentas.find((x) => x.k === k);
    const s = saldoDe.get(k);
    return { nombre, tipo: c.tipo, moneda: c.moneda, formatoExtracto: c.formatoExtracto || null, saldoInicial: s?.valor || 0, saldoInicialFecha: s?.fecha || null, ...CREADOR };
  });
  for (const c of plan.cuentas.filter((x) => x.formatoExtracto)) await prisma.cuentaTesoreria.updateMany({ where: { id: idCuenta.get(c.k), formatoExtracto: null }, data: { formatoExtracto: c.formatoExtracto } });
  const idItem = await porClave(prisma.itemTesoreria, plan.items, (k, nombre) => ({ nombre, ...CREADOR }));
  const idPagador = await porClave(prisma.pagadorTesoreria, plan.pagadores, (k, nombre) => ({ nombre, ...CREADOR }));
  const itemDe = new Map(plan.itemDeConcepto);
  const idConcepto = await porClave(prisma.conceptoTesoreria, [...plan.conceptos, ["traslado entre cuentas propia", "Traslado entre cuentas propias"]], (k, nombre) => ({ nombre, itemId: idItem.get(itemDe.get(k)) || null, ...CREADOR }));
  const nombreConcepto = new Map(plan.conceptos);
  const conceptoTraslado = idConcepto.get("traslado entre cuentas propia");

  // Movimientos y traslados: nuevos se crean; los que ya estaban (misma huella) solo cambian de proyectado a ejecutado.
  const filas = [
    ...plan.movimientos.map((m) => ({
      claveImportacion: m.claveImportacion, fecha: m.fecha, fechaAproximada: m.fechaAproximada, tipo: m.tipo, estado: m.estado, valor: m.valor, moneda: "COP",
      cuentaId: idCuenta.get(m.cuentaK), itemId: idItem.get(m.itemK) || null, conceptoId: idConcepto.get(m.conceptoK) || null,
      concepto: nombreConcepto.get(m.conceptoK) || "(sin concepto)", pagadorId: idPagador.get(m.pagadorK) || null,
      observacion: `Importado de «${archivo}» › «${plan.libro.hoja}» (fila ${m.fila}).`, origen: "importacion", ...CREADOR,
    })),
    ...plan.traslados.map((t) => ({
      claveImportacion: t.claveImportacion, fecha: t.fecha || fechaMes(t.anio, t.mes), fechaAproximada: !t.fecha, tipo: "traslado", estado: t.estado, valor: t.valor, moneda: "COP",
      cuentaId: idCuenta.get(t.origen), cuentaDestinoId: idCuenta.get(t.destino), conceptoId: conceptoTraslado, concepto: "Traslado entre cuentas propias",
      observacion: `Importado de «${archivo}» (fila ${t.filas.join(" y ")}): ${t.texto}`, origen: "importacion", ...CREADOR,
    })),
  ].filter((f) => f.cuentaId && abierto(f.fecha));
  const previos = new Map((await prisma.movimientoTesoreria.findMany({ where: { claveImportacion: { in: filas.map((f) => f.claveImportacion) } }, select: { id: true, claveImportacion: true, estado: true, fecha: true } })).map((m) => [m.claveImportacion, m]));
  const nuevas = filas.filter((f) => !previos.has(f.claveImportacion));
  if (nuevas.length) await prisma.movimientoTesoreria.createMany({ data: nuevas, skipDuplicates: true });
  let actualizados = 0;
  for (const f of filas) {
    const p = previos.get(f.claveImportacion);
    if (p && p.estado === "proyectado" && f.estado === "ejecutado" && abierto(p.fecha)) {
      await prisma.movimientoTesoreria.update({ where: { id: p.id }, data: { estado: "ejecutado" } });
      actualizados++;
    }
  }

  // Reglas aprendidas de las etiquetas manuales de los extractos (solo las que coinciden con un concepto).
  const conceptoGastos = plan.conceptos.find(([, n]) => norm(n) === "gastos bancarios")?.[0];
  const votos = new Map();
  for (const l of plan.extractos.flatMap((e) => e.etiquetas)) {
    let k = l.etiqueta ? clave(l.etiqueta) : null;
    if (!idConcepto.has(k)) k = null;
    if (!k && /^(gmf|retencion|nota debito impuesto financiero)/.test(norm(l.descripcion)) && conceptoGastos) k = conceptoGastos;
    if (!k) continue;
    const p = patronDe(l.descripcion);
    if (!p || p.length < 4) continue;
    if (!votos.has(p)) votos.set(p, new Map());
    votos.get(p).set(k, (votos.get(p).get(k) || 0) + 1);
  }
  let reglas = 0;
  for (const [patron, conteo] of votos) {
    const [k, usos] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
    const r = await prisma.reglaClasificacion.upsert({ where: { patron }, update: {}, create: { patron, conceptoId: idConcepto.get(k), itemId: idItem.get(itemDe.get(k)) || null, usos, ...CREADOR } });
    if (r.createdAt > new Date(Date.now() - 60000)) reglas++;
  }

  // Extractos + conciliación automática de lo que coincide sin dudas.
  const todasReglas = await prisma.reglaClasificacion.findMany({ orderBy: { usos: "desc" } });
  const extractos = [];
  for (const x of plan.extractos) {
    const cuentaId = idCuenta.get(x.cuentaK);
    const lineas = x.lineas.filter((l) => abierto(l.fecha));
    if (!cuentaId || !lineas.length) continue;
    const ya = new Set((await prisma.lineaExtracto.findMany({ where: { cuentaId, clave: { in: lineas.map((l) => l.clave) } }, select: { clave: true } })).map((l) => l.clave));
    const nuevasLineas = lineas.filter((l) => !ya.has(l.clave));
    const fechas = lineas.map((l) => l.fecha).sort();
    const ex = await prisma.extractoBancario.create({ data: { cuentaId, archivo: `${archivo} › ${x.hoja}`.slice(0, 200), desde: fechas[0], hasta: fechas.at(-1), lineasNuevas: nuevasLineas.length, lineasRepetidas: lineas.length - nuevasLineas.length, ...CREADOR } });
    if (nuevasLineas.length) {
      await prisma.lineaExtracto.createMany({
        data: nuevasLineas.map((l) => ({ cuentaId, extractoId: ex.id, fecha: l.fecha, descripcion: (limpio(l.descripcion) || "(sin descripción)").slice(0, 300), tercero: limpio(l.tercero)?.slice(0, 200) || null, valor: l.valor, clave: l.clave, etiqueta: limpio(l.etiqueta)?.slice(0, 300) || null, ...CREADOR })),
        skipDuplicates: true,
      });
    }
    const ls = await prisma.lineaExtracto.findMany({ where: { cuentaId, movimientoId: null, ignorada: false }, orderBy: { fecha: "asc" } });
    const ms = await prisma.movimientoTesoreria.findMany({ where: { estado: "ejecutado", OR: [{ cuentaId }, { cuentaDestinoId: cuentaId }] }, include: { lineas: { select: { cuentaId: true } } } });
    const enlaces = emparejar({ cuentaId, lineas: ls, movs: ms.filter((m) => !m.lineas.some((l) => l.cuentaId === cuentaId)), reglas: todasReglas });
    for (const e of enlaces) await prisma.lineaExtracto.updateMany({ where: { id: { in: e.lineaIds }, movimientoId: null }, data: { movimientoId: e.movimientoId, comoSeEnlazo: e.como, enlazadoAt: new Date(), enlazadoPorNombre: "Conciliación automática" } });
    extractos.push({ hoja: x.hoja, cuenta: x.cuenta, lineasNuevas: nuevasLineas.length, repetidas: lineas.length - nuevasLineas.length, enlazadas: enlaces.reduce((a, e) => a + e.lineaIds.length, 0) });
  }

  return {
    modo, movimientosNuevos: nuevas.length, movimientosActualizados: actualizados, movimientosIguales: filas.length - nuevas.length - actualizados,
    omitidosPorMesFirmado: plan.movimientos.length + plan.traslados.length - filas.length, reglasNuevas: reglas, extractos,
  };
}
