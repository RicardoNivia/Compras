import { prisma } from "@/lib/prisma";
import { listRecords } from "@/lib/records";
import { getSolicitudesPendientes, getRiesgoPresupuesto } from "@/lib/alerts";
import { getPendientes, itemsDeSeccion } from "@/lib/pendientes";
import { ymd, MESES } from "@/lib/reportSchedule";
import { CONSULTAS } from "@/lib/notificacionesCatalogo";

// Consultas DETERMINISTAS de las notificaciones (catálogo en lib/notificacionesCatalogo.js). Ninguna usa IA ni
// acepta SQL o texto libre: solo parámetros ya validados. Reutilizan los mismos cálculos de Mi día y del Dashboard
// para que una notificación nunca diga algo distinto de lo que se ve en pantalla.
//
// Resultado: { total, items: [{ ref, titulo, contexto, detalle, dato, href }], valores: { variable: texto }, enlace }

const SLA = 8;
const fmtCOP = (n) => `$${Math.round(n || 0).toLocaleString("es-CO")}`;
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const igual = (a, b) => !b || /^\s*(tod[oa]s?|cualquier[ae]?)\b/i.test(b) || norm(a) === norm(b);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function fechaLarga(d) {
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Rango de fechas [desde, hasta] (YYYY-MM-DD, ambos incluidos) de un período relativo a `ahora`.
export function rangoPeriodo(periodo, dias, ahora = new Date()) {
  const d0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const mas = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
  const lunes = (d) => mas(d, -((d.getDay() + 6) % 7));
  const corto = (d) => `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  switch (periodo) {
    case "hoy": return { desde: ymd(d0), hasta: ymd(d0), label: `hoy ${corto(d0)}` };
    case "ayer": { const a = mas(d0, -1); return { desde: ymd(a), hasta: ymd(a), label: `ayer ${corto(a)}` }; }
    case "semana_actual": { const l = lunes(d0); return { desde: ymd(l), hasta: ymd(d0), label: `semana del ${corto(l)} al ${corto(d0)}` }; }
    case "semana_anterior": { const l = mas(lunes(d0), -7); const dom = mas(l, 6); return { desde: ymd(l), hasta: ymd(dom), label: `semana del ${corto(l)} al ${corto(dom)}` }; }
    case "mes_actual": { const i = new Date(d0.getFullYear(), d0.getMonth(), 1); return { desde: ymd(i), hasta: ymd(d0), label: `${cap(MESES[i.getMonth()])} ${i.getFullYear()}` }; }
    case "mes_anterior": { const i = new Date(d0.getFullYear(), d0.getMonth() - 1, 1); const f = new Date(d0.getFullYear(), d0.getMonth(), 0); return { desde: ymd(i), hasta: ymd(f), label: `${cap(MESES[i.getMonth()])} ${i.getFullYear()}` }; }
    case "ultimos_n_dias": { const n = Math.min(Math.max(Number(dias) || 7, 1), 366); const i = mas(d0, -(n - 1)); return { desde: ymd(i), hasta: ymd(d0), label: `últimos ${n} días` }; }
    default: return null;
  }
}

const refRegistro = (r) => (r.localSeq ? `#${r.localSeq}` : "—");
const hrefRegistro = (r) => (r.localSeq ? `/registros?q=${encodeURIComponent(`#${r.localSeq}`)}` : "/registros");

function itemCompra(r, extra = {}) {
  return {
    ref: refRegistro(r),
    titulo: r.descripcion || "(sin descripción)",
    contexto: [r.proveedor, r.area].filter(Boolean).join(" · ") || "—",
    detalle: "",
    dato: r.valorConIva != null ? fmtCOP(r.valorConIva) : null,
    href: hrefRegistro(r),
    ...extra,
  };
}

function filtrarCompras(records, p) {
  return records.filter((r) => igual(r.area, p.area) && igual(r.categoria, p.categoria) && igual(r.estado, p.estado));
}

function fechaDe(r, campoFecha) {
  if (campoFecha === "fechaRegistro") return r.fechaRegistro ? ymd(new Date(r.fechaRegistro)) : null;
  return r.fechaSolicitud || null;
}

// ---------- Consultas ----------

async function comprasDelPeriodo(p, ctx, periodoPorDefecto) {
  const rango = rangoPeriodo(p.periodo || periodoPorDefecto, p.dias, ctx.ahora);
  let lista = filtrarCompras(await ctx.records(), p).filter((r) => {
    const f = fechaDe(r, p.campoFecha);
    return f && f >= rango.desde && f <= rango.hasta && r.estado !== "Anulado";
  });
  if (ctx.personal) lista = lista.filter((r) => r.responsableUserId === ctx.destinatario?.id);
  return { rango, lista, valor: lista.reduce((s, r) => s + (r.valorConIva || 0), 0) };
}

async function conteoCompras(p, ctx) {
  const { rango, lista, valor } = await comprasDelPeriodo(p, ctx, "semana_anterior");
  const top = [...lista].sort((a, b) => (b.valorConIva || 0) - (a.valorConIva || 0)).slice(0, 5);
  return {
    total: lista.length,
    items: top.map((r) => itemCompra(r)),
    tituloItems: lista.length > 5 ? "Las 5 de mayor valor" : null,
    valores: { total: String(lista.length), valor_total: fmtCOP(valor), periodo: rango.label },
    enlace: "/registros",
  };
}

const SECCION_POR_PRESET = { por_legalizar: "porLegalizar", por_radicar: "porRadicar", rechazadas: "rechazadas", sin_valoracion: "radicadasSinValorar" };

async function listaCompras(p, ctx) {
  const preset = p.preset || "registradas";
  if (preset === "registradas") {
    const { rango, lista, valor } = await comprasDelPeriodo(p, ctx, "hoy");
    return {
      total: lista.length,
      items: lista.map((x) => itemCompra(x)),
      valores: { total: String(lista.length), valor_total: fmtCOP(valor), periodo: rango.label },
      enlace: "/registros",
    };
  }

  if (SECCION_POR_PRESET[preset]) {
    const persona = ctx.personal ? ctx.destinatario : ctx.propietario;
    const records = await ctx.records();
    const porId = new Map(records.map((r) => [r.id, r]));
    let items = await itemsDeSeccion(SECCION_POR_PRESET[preset], persona);
    items = items.filter((i) => { const r = porId.get(i.recordId || i.id); return !r || (igual(r.area, p.area) && igual(r.categoria, p.categoria)); });
    if (ctx.personal) items = items.filter((i) => i.mio);
    const valor = items.reduce((s, i) => s + (porId.get(i.recordId || i.id)?.valorConIva || 0), 0);
    return {
      total: items.length,
      items: items.map((i) => ({ ref: i.ref, titulo: i.titulo, contexto: i.contexto, detalle: i.detalle, dato: porId.get(i.recordId || i.id)?.valorConIva != null ? fmtCOP(porId.get(i.recordId || i.id).valorConIva) : null, href: i.href })),
      valores: { total: String(items.length), valor_total: fmtCOP(valor), periodo: "a la fecha" },
      enlace: "/alertas",
    };
  }

  // Plazo de 8 días hábiles (mismo SLA de Mi día y del Dashboard).
  const records = filtrarCompras(await ctx.records(), p);
  const responsablePorId = new Map(records.map((r) => [r.id, r.responsableUserId]));
  let pendientes = (await getSolicitudesPendientes(records)).filter((r) => r.diasHabiles >= 0);
  if (preset === "vencen_hoy") pendientes = pendientes.filter((r) => r.diasHabiles === SLA);
  else if (preset === "por_vencer") pendientes = pendientes.filter((r) => r.diasHabiles >= SLA - 2 && r.diasHabiles < SLA);
  else if (preset === "atrasadas") pendientes = pendientes.filter((r) => r.diasHabiles > SLA);
  else throw Object.assign(new Error(`Situación de compras desconocida: ${preset}`), { status: 400 });
  if (ctx.personal) pendientes = pendientes.filter((r) => responsablePorId.get(r.id) === ctx.destinatario?.id);
  const valor = pendientes.reduce((s, r) => s + (r.valorConIva || 0), 0);
  return {
    total: pendientes.length,
    items: pendientes.map((r) => itemCompra(r, { contexto: [r.responsable, r.proveedor, r.area].filter(Boolean).join(" · ") || "—", detalle: `${r.diasHabiles} días hábiles desde la solicitud${preset === "por_vencer" ? ` · le quedan ${SLA - r.diasHabiles}` : ""}` })),
    valores: { total: String(pendientes.length), valor_total: fmtCOP(valor), periodo: "hoy" },
    enlace: "/registros",
  };
}

async function valoracionesCompras(p, ctx) {
  const rango = rangoPeriodo(p.periodo || "ayer", p.dias, ctx.ahora);
  const desde = new Date(`${rango.desde}T00:00:00`);
  const hasta = new Date(`${rango.hasta}T23:59:59.999`);
  const max = p.puntajeMax != null ? Number(p.puntajeMax) : null;
  const rows = await prisma.valoracionCompra.findMany({
    where: { createdAt: { gte: desde, lte: hasta } },
    include: { record: { select: { id: true, localSeq: true, descripcion: true, proveedor: true, area: true, responsableUserId: true, valorConIva: true } } },
    orderBy: { puntajeCompra: "asc" },
  });
  let lista = rows.filter((v) => igual(v.record?.area, p.area));
  if (max != null) lista = lista.filter((v) => v.puntajeCompra <= max || (v.puntajeProveedor != null && v.puntajeProveedor <= max));
  if (ctx.personal) lista = lista.filter((v) => v.record?.responsableUserId === ctx.destinatario?.id);
  const promedio = lista.length ? (lista.reduce((s, v) => s + v.puntajeCompra, 0) / lista.length).toFixed(1).replace(".", ",") : "—";
  return {
    total: lista.length,
    items: lista.map((v) => itemCompra(v.record || {}, {
      dato: `${v.puntajeCompra}/5`,
      detalle: `Compra ${v.puntajeCompra}/5${v.puntajeProveedor != null ? ` · proveedor ${v.puntajeProveedor}/5` : ""} · ${String(v.resumen || "").slice(0, 160)}`,
    })),
    valores: { total: String(lista.length), periodo: rango.label, promedio },
    enlace: "/registros",
  };
}

async function misPendientes(_p, ctx) {
  const d = await getPendientes(ctx.destinatario);
  const secciones = d.secciones.filter((s) => s.total > 0);
  return {
    total: d.totales.total,
    items: secciones.map((s) => ({
      ref: s.criticos ? `${s.criticos} urgente(s)` : "",
      titulo: s.titulo,
      contexto: s.items.slice(0, 3).map((i) => i.ref).filter(Boolean).join(", "),
      detalle: s.items[0] ? `Primero: ${s.items[0].titulo}` : "",
      dato: String(s.total),
      href: "/alertas",
    })),
    valores: { total: String(d.totales.total), urgentes: String(d.totales.criticos) },
    enlace: "/alertas",
  };
}

const SECCION_PROVEEDORES = { desactualizados: "provDesactualizados", estancados: "provEstancados", checklist: "provChecklist", por_registrar: "provPorRegistrar" };

async function proveedoresCiclo(p, ctx) {
  const clave = SECCION_PROVEEDORES[p.preset || "desactualizados"];
  if (!clave) throw Object.assign(new Error(`Situación de proveedores desconocida: ${p.preset}`), { status: 400 });
  const items = await itemsDeSeccion(clave, ctx.propietario);
  return {
    total: items.length,
    items: items.map((i) => ({ ref: i.ref, titulo: i.titulo, contexto: i.contexto, detalle: i.detalle, dato: null, href: i.href })),
    valores: { total: String(items.length) },
    enlace: "/proveedores",
  };
}

async function presupuestoEjecucion(p, ctx) {
  const umbral = Math.min(Math.max(Number(p.umbral) || 80, 1), 500);
  const filas = (await getRiesgoPresupuesto(await ctx.records())).filter((f) => f.porcentaje != null && f.porcentaje >= umbral && igual(f.area, p.area));
  return {
    total: filas.length,
    items: filas.map((f) => ({
      ref: `${f.porcentaje}%`,
      titulo: f.area,
      contexto: `Presupuesto ${f.anio}`,
      detalle: `Gastado ${fmtCOP(f.gastado)} de ${fmtCOP(f.presupuestado)}`,
      dato: `${f.porcentaje}%`,
      href: "/presupuesto",
    })),
    valores: { total: String(filas.length), umbral: `${umbral}%` },
    enlace: "/presupuesto",
  };
}

const EJECUTORES = {
  conteo_compras: conteoCompras,
  lista_compras: listaCompras,
  valoraciones_compras: valoracionesCompras,
  mis_pendientes: misPendientes,
  proveedores_ciclo: proveedoresCiclo,
  presupuesto_ejecucion: presupuestoEjecucion,
};

// Contexto compartido por todas las consultas de UNA ejecución: los registros se cargan una sola vez aunque haya
// varios destinatarios con alcance personal.
export function crearContexto({ propietario, ahora = new Date() }) {
  let recordsPromise = null;
  return {
    propietario,
    ahora,
    records: () => (recordsPromise ||= listRecords()),
  };
}

// notif: { consulta, parametros (objeto), alcance }. destinatario: solo con alcance "personal".
export async function ejecutarConsulta(notif, ctxBase, destinatario = null) {
  const def = CONSULTAS[notif.consulta];
  const fn = EJECUTORES[notif.consulta];
  if (!def || !fn) throw Object.assign(new Error(`Consulta desconocida: ${notif.consulta}`), { status: 400 });
  const personal = notif.alcance === "personal";
  const ctx = { ...ctxBase, personal, destinatario: personal ? destinatario : null };
  const res = await fn(notif.parametros || {}, ctx);
  res.valores = { ...res.valores, fecha: fechaLarga(ctxBase.ahora), nombre: (destinatario || ctxBase.propietario)?.nombre || "" };
  return res;
}
