import { prisma } from "@/lib/prisma";
import { logConfigAgente } from "@/lib/audit";

// Encendido de los agentes que corren solos. Apagados por defecto: sin una fila activa, el agente no revisa nada por su
// cuenta ni manda avisos a la Bandeja (a pedido, con "Buscar ahora", sí funciona).
export const AGENTES = { asociador: "Asociador de compras" };

export async function agenteActivo(clave) {
  const r = await prisma.configAgente.findUnique({ where: { clave } }).catch(() => null);
  return !!r?.activo;
}

export async function estadoAgente(clave) {
  const r = await prisma.configAgente.findUnique({ where: { clave } });
  return { clave, activo: !!r?.activo, actualizadoPorNombre: r?.actualizadoPorNombre || r?.creadoPorNombre || null, updatedAt: r?.updatedAt || null };
}

export async function activarAgente(clave, activo, actor) {
  if (!AGENTES[clave]) throw Object.assign(new Error("Agente desconocido."), { status: 400 });
  const antes = await prisma.configAgente.findUnique({ where: { clave } });
  await prisma.configAgente.upsert({
    where: { clave },
    update: { activo: !!activo, actualizadoPorUserId: actor?.id || null, actualizadoPorNombre: actor?.nombre || null },
    create: { clave, activo: !!activo, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
  });
  if (!!antes?.activo !== !!activo) logConfigAgente(actor, clave, AGENTES[clave], activo).catch(() => {});
  return estadoAgente(clave);
}
