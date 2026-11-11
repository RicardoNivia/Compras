import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { leerSoporte } from "@/lib/tesoreria/soportes";

/**
 * @openapi
 * /api/tesoreria/soporte/leer:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Nova lee el comprobante (multipart: archivo) y devuelve fecha, valor, tipo, tercero, referencia y descripción para llenar el formulario del movimiento; avisa si el archivo ya es soporte de otro. No guarda nada. Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ request }) => {
  const archivo = await archivoDe(await request.formData());
  if (!archivo) throw Object.assign(new Error("Adjunta el comprobante."), { status: 400 });
  return leerSoporte(archivo.buffer, archivo.nombre);
});
