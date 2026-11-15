import { conConsumo, archivoDe } from "@/lib/consumo/ruta";
import { agregarSoporte } from "@/lib/consumo/recibos";

/**
 * @openapi
 * /api/consumo/recibos/{id}/soportes:
 *   post:
 *     tags: [Consumo]
 *     summary: "Adjunta el PDF o la foto del recibo (multipart, campo `archivo`)."
 */
export const POST = conConsumo("registro", async ({ request, user, params }) => {
  const archivo = await archivoDe(await request.formData());
  if (!archivo) throw Object.assign(new Error("Adjunta el soporte."), { status: 400 });
  return agregarSoporte(user, params.id, archivo);
});
