import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { solicitudesPendientes } from "@/lib/solicitudesCompra";

/**
 * @openapi
 * /api/solicitudes-compra:
 *   get:
 *     tags: [Bienestar]
 *     summary: Solicitudes de compra pendientes. Requiere createRecord.
 */
export async function GET() {
  const { denied } = await requirePermission("createRecord");
  if (denied) return denied;
  try {
    return NextResponse.json({ solicitudes: await solicitudesPendientes() });
  } catch (err) {
    return apiError(err);
  }
}
