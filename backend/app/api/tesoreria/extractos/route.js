import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { analizarExtracto, listExtractos } from "@/lib/tesoreria/extractos";

/**
 * @openapi
 * /api/tesoreria/extractos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Extractos subidos (bancoId, page, size)."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Registra los movimientos de un extracto (multipart: bancoId, archivo PDF/Excel/CSV). No duplica lo que ya vino de la plantilla ni lo registrado a mano (nivel registro)."
 */
export const GET = conTesoreria("consulta", ({ query }) => listExtractos(query));
export const POST = conTesoreria("registro", async ({ request, user }) => {
  const form = await request.formData();
  const archivo = await archivoDe(form);
  if (!archivo) throw Object.assign(new Error("Adjunta el extracto."), { status: 400 });
  // Solo analiza: no registra nada hasta POST /api/tesoreria/extractos/aplicar con lo aprobado.
  return analizarExtracto(user, form.get("bancoId"), archivo.buffer, archivo.nombre);
});
