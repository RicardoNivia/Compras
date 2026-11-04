import { prisma } from "@/lib/prisma";
import { logSalarioMinimo } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";

// Salario mínimo mensual legal vigente (SMMLV) por año, administrado en Maestros de Compras. El agente cotizador lo usa
// para el umbral del cuadro comparativo (procedimiento ADM-P-01: 2 SMMLV administrativas, 4 técnicas).

function error(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

const aCliente = (r) => ({ id: r.id, anio: r.anio, valor: r.valor, norma: r.norma, createdAt: r.createdAt, updatedAt: r.updatedAt, creadoPorNombre: r.creadoPorNombre, actualizadoPorNombre: r.actualizadoPorNombre });

export async function listSalarios() {
  return (await prisma.salarioMinimo.findMany({ orderBy: { anio: "desc" } })).map(aCliente);
}

// El del año pedido (por defecto, el año en curso en Colombia). Si ese año aún no está, el del último año registrado,
// avisando que no es el del año (exacto: false). Sin ninguno, null.
export async function salarioVigente(anio = Number(hoyColombia().slice(0, 4))) {
  const exacto = await prisma.salarioMinimo.findUnique({ where: { anio } });
  if (exacto) return { anio, valor: exacto.valor, norma: exacto.norma, exacto: true };
  const ultimo = await prisma.salarioMinimo.findFirst({ where: { anio: { lt: anio } }, orderBy: { anio: "desc" } });
  return ultimo ? { anio: ultimo.anio, valor: ultimo.valor, norma: ultimo.norma, exacto: false, anioPedido: anio } : null;
}

export async function guardarSalario(body, actor) {
  const anio = Number(body?.anio);
  const valor = Number(body?.valor);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw error("Indica un año válido.");
  if (!Number.isFinite(valor) || valor <= 0) throw error("El salario mínimo debe ser un valor en pesos mayor que cero.");
  const norma = String(body?.norma ?? "").trim().slice(0, 200) || null;
  const antes = await prisma.salarioMinimo.findUnique({ where: { anio } });
  const row = antes
    ? await prisma.salarioMinimo.update({ where: { anio }, data: { valor, norma, actualizadoPorNombre: actor?.nombre || null } })
    : await prisma.salarioMinimo.create({ data: { anio, valor, norma, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
  logSalarioMinimo(actor, row, antes ? "editar" : "crear", antes ? { valor: antes.valor, norma: antes.norma } : null).catch(() => {});
  return aCliente(row);
}

export async function eliminarSalario(anio, actor) {
  const row = await prisma.salarioMinimo.findUnique({ where: { anio: Number(anio) } });
  if (!row) throw error("Ese año no tiene salario mínimo registrado.", 404);
  await prisma.salarioMinimo.delete({ where: { anio: row.anio } });
  logSalarioMinimo(actor, row, "eliminar", { valor: row.valor, norma: row.norma }).catch(() => {});
}
