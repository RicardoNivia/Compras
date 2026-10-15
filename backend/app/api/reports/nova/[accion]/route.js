import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { createJob } from "@/lib/reportJobs";
import { armarDesdePedido, editarConNova, interpretarProgramacion, redactarMensaje } from "@/lib/reportNova";

// Nova en el Estudio de informes. Cada acción llama a la IA y puede tardar más de lo que el proxy del frontend deja
// esperar una sola llamada, así que corre como trabajo en segundo plano: responde { jobId } y el cliente consulta el
// resultado en /api/reports/jobs/{jobId} (ver lib/reportJobs.js).
const ACCIONES = {
  armar: (b) => {
    if (!b.pedido || !String(b.pedido).trim()) throw Object.assign(new Error("Describe el informe que necesitas."), { status: 400 });
    return () => armarDesdePedido(b.pedido);
  },
  editar: (b) => {
    if (!b.instruccion || !String(b.instruccion).trim()) throw Object.assign(new Error("Dile a Nova qué cambiar."), { status: 400 });
    return () => editarConNova(b);
  },
  programacion: (b) => {
    if (!b.texto || !String(b.texto).trim()) throw Object.assign(new Error("Escribe cuándo debe generarse."), { status: 400 });
    return () => interpretarProgramacion(b.texto);
  },
  mensaje: (b) => () => redactarMensaje(b),
};

/**
 * @openapi
 * /api/reports/nova/{accion}:
 *   post:
 *     tags: [Informes]
 *     summary: Nova en el Estudio de informes. armar crea la estructura desde un pedido, editar aplica un cambio pedido en lenguaje natural, programacion interpreta cuándo enviar y mensaje redacta el correo. Corre en segundo plano, el resultado se consulta en /api/reports/jobs/{jobId} (requiere permiso viewReportes).
 *     parameters:
 *       - { name: accion, in: path, required: true, schema: { type: string, enum: [armar, editar, programacion, mensaje] } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       202:
 *         description: Trabajo creado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { jobId: { type: string } } }
 *       400:
 *         description: Datos incompletos.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request, { params }) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  const crear = ACCIONES[params.accion];
  if (!crear) return NextResponse.json({ error: "Acción no válida." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const tarea = crear(body);
    return NextResponse.json({ jobId: createJob(tarea) }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
