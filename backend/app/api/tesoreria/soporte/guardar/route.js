import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { guardarConSoporte } from "@/lib/tesoreria/soportes";
import { getMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/soporte/guardar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Guarda el movimiento confirmado con su soporte (multipart: archivo, datos JSON, proyectadoId y lineaId opcionales). Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ request, user }) => {
  const form = await request.formData();
  const archivo = await archivoDe(form);
  let datos = {};
  try { datos = JSON.parse(String(form.get("datos") || "{}")); } catch { throw Object.assign(new Error("Datos inválidos."), { status: 400 }); }
  if (JSON.stringify(datos).includes("�")) throw Object.assign(new Error("El texto contiene caracteres dañados: vuelve a escribir los acentos."), { status: 400 });
  const mv = await guardarConSoporte(user, { datos, proyectadoId: form.get("proyectadoId") || null, lineaId: form.get("lineaId") || null, archivo });
  return getMovimiento(mv.id);
});
