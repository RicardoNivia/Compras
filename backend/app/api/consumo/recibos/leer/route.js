import { conConsumo, archivoDe } from "@/lib/consumo/ruta";
import { leerRecibo } from "@/lib/consumo/lectura";

export const maxDuration = 300;

/**
 * @openapi
 * /api/consumo/recibos/leer:
 *   post:
 *     tags: [Consumo]
 *     summary: "Nova lee un recibo (multipart, campo `archivo`: PDF o foto) y devuelve lo leído, la sede que propone y lo que comprobó. No guarda nada."
 */
export const POST = conConsumo("registro", async ({ request }) => {
  const archivo = await archivoDe(await request.formData());
  if (!archivo) throw Object.assign(new Error("Adjunta el recibo."), { status: 400 });
  return leerRecibo(archivo);
});
