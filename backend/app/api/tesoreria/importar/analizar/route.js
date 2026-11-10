import { conTesoreria, archivoDe } from "@/lib/tesoreria/ruta";
import { analizarExcel } from "@/lib/tesoreria/importarExcelApp";

/**
 * @openapi
 * /api/tesoreria/importar/analizar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Analiza la plantilla Excel de flujo de caja (multipart: archivo) SIN escribir nada: reconoce el libro (o Nova propone el mapeo), arma el plan y devuelve la vista previa con un token. Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ request, user }) => {
  const archivo = await archivoDe(await request.formData());
  if (!archivo) throw Object.assign(new Error("Sube la plantilla en Excel."), { status: 400 });
  return analizarExcel(user, archivo.buffer, archivo.nombre);
});
