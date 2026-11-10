import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getEdicionPdf } from "@/lib/reportEdiciones";

/**
 * @openapi
 * /api/reports/ediciones/{edId}/pdf:
 *   get:
 *     tags: [Informes]
 *     summary: Descarga el PDF de una edición tal como se generó. Queda registrado en la actividad del informe (requiere permiso viewReportes).
 *     parameters:
 *       - { name: edId, in: path, required: true, schema: { type: integer } }
 *       - { name: inline, in: query, required: false, schema: { type: string, enum: ["1"] } }
 *     responses:
 *       200:
 *         description: PDF.
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       404:
 *         description: La edición no tiene PDF.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request, { params }) {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    const { buffer, filename } = await getEdicionPdf(params.edId, user);
    const inline = request.nextUrl.searchParams.get("inline") === "1";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
