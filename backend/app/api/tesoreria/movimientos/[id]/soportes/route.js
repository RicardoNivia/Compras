import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { agregarSoporte } from "@/lib/tesoreria/soportes";
import { getMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/movimientos/{id}/soportes:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Adjunta un soporte (multipart: archivo PDF o foto, revisado por contenido) a un movimiento. Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ request, user, params }) => {
  const archivo = await archivoDe(await request.formData());
  if (!archivo) throw Object.assign(new Error("Adjunta el soporte."), { status: 400 });
  await agregarSoporte(user, params.id, archivo);
  return getMovimiento(params.id);
});
