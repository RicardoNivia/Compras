import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { aplicarPlantilla } from "@/lib/tesoreria/importarPlantilla";

/**
 * @openapi
 * /api/tesoreria/importar/aplicar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Carga la plantilla con lo que la persona confirmó (multipart: archivo + decisiones JSON { bancos, pagos, periodicos, diaCorteDefecto }). Idempotente (nivel registro)."
 */
export const POST = conTesoreria("registro", async ({ request, user }) => {
  const form = await request.formData();
  const archivo = await archivoDe(form);
  if (!archivo) throw Object.assign(new Error("Adjunta la plantilla de Excel."), { status: 400 });
  let decisiones = {};
  try { decisiones = JSON.parse(String(form.get("decisiones") || "{}")); } catch { throw Object.assign(new Error("Las decisiones no son válidas."), { status: 400 }); }
  return aplicarPlantilla(user, archivo.buffer, archivo.nombre, decisiones);
});
