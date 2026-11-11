import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";

// Años que ofrecen los selectores de Tesorería: del año en curso hasta 2028 (o el siguiente, si ya pasó 2028); los años
// anteriores solo si tienen pagos o movimientos y los creados a mano en Gastos periódicos («Crear otro año»). Solo se crean ahí.
export const ANIO_MAXIMO_POR_DEFECTO = 2028;
const badRequest = (m) => Object.assign(new Error(m), { status: 400 });

export async function listAnios() {
  const actual = Number(hoyColombia().slice(0, 4));
  const [creados, pagos, movs] = await Promise.all([
    prisma.anioTesoreria.findMany({ orderBy: { anio: "asc" } }),
    prisma.pagoProgramado.groupBy({ by: ["anio"] }),
    prisma.$queryRaw`SELECT DISTINCT CAST(substr("fecha", 1, 4) AS INTEGER) AS anio FROM "tesoreria_movimientos_banco" WHERE "fecha" ~ '^[0-9]{4}'`.catch(() => []),
  ]);
  const porDefecto = [];
  for (let a = actual; a <= Math.max(ANIO_MAXIMO_POR_DEFECTO, actual + 1); a++) porDefecto.push(a);
  // Pagos, gastos y dashboard: los años anteriores solo si tienen pagos. Movimientos, saldos y conciliación: también los
  // años con movimientos del banco (aniosMovimientos).
  const anios = [...new Set([...porDefecto, ...pagos.map((p) => p.anio), ...creados.map((c) => c.anio)])].filter(Boolean).sort((a, b) => a - b);
  const aniosMovimientos = [...new Set([...anios, ...movs.map((m) => Number(m.anio))])].filter(Boolean).sort((a, b) => a - b);
  // Saldos: un año anterior solo tiene saldos si tiene algún saldo del banco (extracto), un saldo inicial digitado o el
  // saldo de diciembre del año anterior; con solo movimientos sueltos no hay con qué calcular el saldo.
  const [inis, reps] = await Promise.all([prisma.saldoInicialBanco.groupBy({ by: ["anio"] }), prisma.saldoReportadoBanco.groupBy({ by: ["anio", "mes", "tipo"] })]);
  const conSaldo = new Set([...inis.map((x) => x.anio), ...reps.map((x) => x.anio), ...reps.filter((x) => x.mes === 12 && x.tipo === "final").map((x) => x.anio + 1)]);
  const aniosSaldos = [...new Set([...anios.filter((a) => a >= actual), ...[...conSaldo].filter((a) => a <= actual)])].sort((a, b) => a - b);
  return { anios, aniosMovimientos, aniosSaldos, actual, creados: creados.map((c) => ({ anio: c.anio, creadoPorNombre: c.creadoPorNombre, createdAt: c.createdAt })) };
}

export async function crearAnio(actor, body) {
  const anio = Number(body?.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw badRequest("Escribe un año entre 2000 y 2100.");
  const { anios } = await listAnios();
  if (anios.includes(anio)) throw badRequest(`${anio} ya existe: elígelo en el selector de año.`);
  const fila = await prisma.anioTesoreria.create({ data: { anio, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
  logTesoreria(actor, { action: "crear", entityType: "anioTesoreria", recordId: fila.id, recordInfo: `Año ${anio}`, after: { anio } }).catch(() => {});
  return { anio, ...(await listAnios()) };
}
