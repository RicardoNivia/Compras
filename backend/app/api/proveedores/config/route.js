import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getConfigProveedores, updateConfigProveedores } from "@/lib/proveedoresCiclo";
import { anioCicloVigente, inicioCiclo, finCicloFecha, diasParaCorte } from "@/lib/proveedoresCicloReglas";

// Hora y fecha DEL SERVIDOR (nunca del navegador) y el ciclo que de ahí resulta, en hora de Colombia.
async function configConReloj() {
  const cfg = await getConfigProveedores();
  const ahora = new Date();
  const anio = anioCicloVigente(ahora, cfg);
  const fmt = (d) => d.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short", hour12: false });
  const dia = (d) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });
  return {
    ...cfg,
    ahoraServidor: ahora.toISOString(),
    ahoraColombia: fmt(ahora),
    cicloVigente: anio,
    inicioCiclo: dia(inicioCiclo(anio, cfg)),
    finCiclo: dia(finCicloFecha(anio, cfg)),
    diasParaCorte: diasParaCorte(ahora, cfg),
  };
}

/**
 * @openapi
 * /api/proveedores/config:
 *   get:
 *     tags: [Proveedores]
 *     summary: Fecha de corte del ciclo de actualización (requiere permiso "viewProveedores").
 *   put:
 *     tags: [Proveedores]
 *     summary: Cambia la fecha de corte y los días de aviso (requiere permiso editProveedores, es decir admin o rol Proveedores). Aplica desde el próximo ciclo.
 */
export async function GET() {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    return NextResponse.json(await configConReloj());
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    await updateConfigProveedores(body, user);
    return NextResponse.json(await configConReloj());
  } catch (err) {
    return apiError(err);
  }
}
