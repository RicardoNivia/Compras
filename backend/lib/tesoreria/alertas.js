import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { badRequest, notFound, fmtMoneda, TIPOS_PAGO, accesoDe } from "@/lib/tesoreria/comun";

// Alertas de Tesorería: llegan a Alertas y notificaciones › Mi día (no hay una página propia en Tesorería):
//   - las que deja la importación (valores en 0, fechas dañadas, saldos del Excel por registrar, filas sin datos):
//     quedan guardadas hasta que alguien las marca como revisadas (o se corrige el pago);
//   - los pagos pendientes vencidos (se calculan en vivo: fecha de vencimiento ya pasó y siguen en P).

export const TIPOS_ALERTA = { valorCero: "Pago en 0", fechaDanada: "Fecha dañada", saldoInicial: "Saldo del Excel", sinDatos: "Fila sin datos", otro: "Otro" };

// lista: [{ tipo, mensaje, refTipo, refId, clave }]. La clave evita repetir la misma alerta al volver a importar.
export async function crearAlertas(actor, lista) {
  if (!lista.length) return 0;
  const r = await prisma.alertaTesoreria.createMany({
    data: lista.map((a) => ({ ...a, mensaje: String(a.mensaje).slice(0, 500), creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || "Importación Excel" })),
    skipDuplicates: true,
  });
  return r.count;
}

// A dónde ir a corregir cada alerta (desde Mi día).
const hrefDe = (a) => (a.refTipo === "pago" && a.refId ? `/tesoreria/pagos?id=${a.refId}` : a.refTipo === "movimiento" && a.refId ? `/tesoreria/movimientos?id=${a.refId}` : a.tipo === "saldoInicial" ? "/tesoreria/saldos" : a.refTipo === "banco" ? "/tesoreria/movimientos" : "/tesoreria/importar");

export async function listAlertas({ resueltas = false, tipo, page = 1, size = 25 } = {}) {
  size = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 25;
  const where = { resuelta: !!resueltas, ...(tipo && TIPOS_ALERTA[tipo] ? { tipo } : {}) };
  const total = await prisma.alertaTesoreria.count({ where });
  const paginas = Math.max(1, Math.ceil(total / size));
  page = Math.min(Math.max(1, Number(page) || 1), paginas);
  const items = await prisma.alertaTesoreria.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size });
  const porTipo = await prisma.alertaTesoreria.groupBy({ by: ["tipo"], where: { resuelta: false }, _count: { _all: true } });
  return {
    items: items.map((a) => ({ ...a, tipoTexto: TIPOS_ALERTA[a.tipo] || a.tipo, href: hrefDe(a) })),
    total, page, size,
    pendientesPorTipo: Object.fromEntries(porTipo.map((x) => [x.tipo, x._count._all])),
  };
}

export async function resolverAlertas(actor, ids, resuelta = true) {
  const lista = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean);
  if (!lista.length) throw badRequest("Indica las alertas.");
  const filas = await prisma.alertaTesoreria.findMany({ where: { id: { in: lista } } });
  if (!filas.length) throw notFound("Las alertas no existen.");
  await prisma.alertaTesoreria.updateMany({ where: { id: { in: filas.map((a) => a.id) } }, data: resuelta ? { resuelta: true, resueltaPorNombre: actor.nombre || null, resueltaAt: new Date() } : { resuelta: false, resueltaPorNombre: null, resueltaAt: null } });
  logTesoreria(actor, {
    action: resuelta ? "revisar" : "reabrir", entityType: "alertaTesoreria", recordId: filas.length === 1 ? filas[0].id : `${filas.length}-alertas`,
    recordInfo: filas.length === 1 ? filas[0].mensaje.slice(0, 160) : `${filas.length} alertas de Tesorería`,
    after: { alertas: filas.map((a) => `#${a.id} ${a.mensaje.slice(0, 80)}`).join(" · ").slice(0, 900), estado: resuelta ? "Revisada" : "Pendiente" },
  }).catch(() => {});
  return { ok: true, cambiadas: filas.length };
}

// ---------- Mi día ----------

export async function itemsAlertasImportacion(user) {
  const puedeRevisar = !!(user && (await accesoDe(user))?.puedeRegistrar);
  const filas = await prisma.alertaTesoreria.findMany({ where: { resuelta: false }, orderBy: { createdAt: "asc" }, take: 200 });
  const hoy = Date.parse(hoyColombia());
  return filas.map((a) => ({
    id: `tesal-${a.id}`, ref: TIPOS_ALERTA[a.tipo] || "Tesorería", titulo: a.mensaje, contexto: `Importación · ${a.creadoPorNombre || ""}`.trim(),
    dias: Math.max(0, Math.floor((hoy - new Date(a.createdAt).getTime()) / 86400000)), detalle: "Corrígela con «Ir» y márcala como revisada aquí mismo", accion: puedeRevisar ? "revisarAlertaTesoreria" : null, alertaId: a.id,
    nivel: a.tipo === "valorCero" || a.tipo === "fechaDanada" ? "atencion" : "info", href: hrefDe(a), mio: false,
  }));
}

export async function itemsPagosVencidos() {
  const hoy = hoyColombia();
  const filas = await prisma.pagoProgramado.findMany({ where: { estado: "P", fecha: { lt: hoy }, tipo: { in: ["E", "I", "J"] } }, orderBy: { fecha: "asc" }, take: 200 });
  return filas.map((p) => {
    const dias = Math.floor((Date.parse(hoy) - Date.parse(p.fecha)) / 86400000);
    return {
      id: `tespv-${p.id}`, ref: TIPOS_PAGO[p.tipo], titulo: p.concepto, contexto: `Vencía el ${p.fecha} · ${fmtMoneda(p.valor, p.moneda)}`, dias,
      detalle: Number(p.valor) > 0 ? "Ingreso esperado sin registrar" : "Sigue pendiente: asóciale el movimiento o márcalo pagado", nivel: dias > 15 ? "critico" : "atencion",
      href: `/tesoreria/pagos?id=${p.id}`, mio: false,
    };
  });
}
