import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { describirCuando, proximasFechas } from "@/lib/notificaciones";

/**
 * @openapi
 * /api/notificaciones/proximas:
 *   post:
 *     tags: [Notificaciones]
 *     summary: Vista previa de la programación (descripción y próximas 5 fechas) para el formulario.
 */
export async function POST(request) {
  const { denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  const r = await request.json().catch(() => ({}));
  const num = (v) => (v != null && v !== "" ? Number(v) : null);
  const regla = { frecuencia: r.frecuencia, diaSemana: num(r.diaSemana), diaMes: num(r.diaMes), ordinal: num(r.ordinal), fechaUnica: r.fechaUnica || null, hora: r.hora || null, siFestivo: r.siFestivo || "correr", sabadoHabil: !!r.sabadoHabil, domingoHabil: !!r.domingoHabil };
  return NextResponse.json({ cuando: describirCuando(regla), proximas: proximasFechas(regla, 5) });
}
