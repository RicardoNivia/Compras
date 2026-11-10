import { NextResponse } from "next/server";
import { requirePermission, requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { listSalarios, guardarSalario, eliminarSalario, salarioVigente } from "@/lib/salarioMinimo";

/**
 * @openapi
 * /api/maestros/salario-minimo:
 *   get:
 *     tags: [Maestros]
 *     summary: Salario mínimo (SMMLV) por año y el vigente. Lo ven quienes administran maestros o usan el cotizador de Bienestar.
 *     responses:
 *       200: { description: "{ salarios, vigente }" }
 *   post:
 *     tags: [Maestros]
 *     summary: "Crea o actualiza el de un año: { anio, valor, norma? }. Requiere viewMaestros. Auditado."
 *     responses:
 *       200: { description: "{ salario }" }
 *   delete:
 *     tags: [Maestros]
 *     summary: Elimina el de un año (?anio=). Requiere viewMaestros. Auditado.
 *     responses:
 *       200: { description: "{ ok: true }" }
 */
export async function GET() {
  const { denied } = await requireAlgunPermiso(["viewMaestros", "editBienestar", "editFundacion"]);
  if (denied) return denied;
  try {
    return NextResponse.json({ salarios: await listSalarios(), vigente: await salarioVigente() });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requirePermission("viewMaestros");
  if (denied) return denied;
  try {
    return NextResponse.json({ salario: await guardarSalario(await request.json(), user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request) {
  const { user, denied } = await requirePermission("viewMaestros");
  if (denied) return denied;
  try {
    await eliminarSalario(new URL(request.url).searchParams.get("anio"), user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
