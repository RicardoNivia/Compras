import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { analizarPlantilla } from "@/lib/tesoreria/importarPlantilla";

/**
 * @openapi
 * /api/tesoreria/importar/analizar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Analiza la plantilla de Excel (multipart: archivo): pestañas de banco y de pagos, nuevos/repetidos, saldos, ceros y gastos periódicos propuestos. No escribe nada (nivel registro)."
 */
export const POST = conTesoreria("registro", async ({ request }) => {
  const archivo = await archivoDe(await request.formData());
  if (!archivo) throw Object.assign(new Error("Adjunta la plantilla de Excel."), { status: 400 });
  return analizarPlantilla(archivo.buffer, archivo.nombre);
});
