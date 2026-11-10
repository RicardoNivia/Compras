import { prisma } from "@/lib/prisma";
import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { importarExtracto } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/extractos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Importaciones de extracto (paginado: cuentaId, page, size)."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Importa el extracto de una cuenta (multipart: cuentaId, archivo Excel/CSV) y enlaza solo lo que coincide sin dudas. Nivel registro."
 */
export const GET = conTesoreria("consulta", async ({ query }) => {
  const size = [10, 25, 50, 100].includes(Number(query.size)) ? Number(query.size) : 10;
  const where = query.cuentaId ? { cuentaId: Number(query.cuentaId) } : {};
  const total = await prisma.extractoBancario.count({ where });
  const page = Math.min(Math.max(1, Number(query.page) || 1), Math.max(1, Math.ceil(total / size)));
  const [items, cuentas] = await Promise.all([
    prisma.extractoBancario.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size }),
    prisma.cuentaTesoreria.findMany({ select: { id: true, nombre: true } }),
  ]);
  const nombre = new Map(cuentas.map((c) => [c.id, c.nombre]));
  return { items: items.map((e) => ({ ...e, cuenta: nombre.get(e.cuentaId) })), total, page, size };
});

export const POST = conTesoreria("registro", async ({ request, user }) => {
  const form = await request.formData();
  const archivo = await archivoDe(form);
  if (!archivo) throw Object.assign(new Error("Adjunta el extracto."), { status: 400 });
  return importarExtracto(user, form.get("cuentaId"), archivo.buffer, archivo.nombre);
});
