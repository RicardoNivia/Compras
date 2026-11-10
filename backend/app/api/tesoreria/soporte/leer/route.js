import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { proponerDesdeSoporte } from "@/lib/tesoreria/soportes";

/**
 * @openapi
 * /api/tesoreria/soporte/leer:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Nova lee el comprobante (multipart: archivo) y el sistema propone el movimiento, el proyectado que cumple, la línea del extracto y si es duplicado. No guarda nada. Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ request }) => {
  const archivo = await archivoDe(await request.formData());
  if (!archivo) throw Object.assign(new Error("Adjunta el comprobante."), { status: 400 });
  return proponerDesdeSoporte(archivo.buffer, archivo.nombre);
});
