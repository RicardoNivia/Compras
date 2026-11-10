import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { generateStructuredJson } from "@/lib/aiStructured";

// Lee el texto de un correo (como el que llega pidiendo registrar un
// proveedor nuevo en SRM) y extrae los campos del formulario de "Registrar
// proveedor" (pestaña Nuevos). Nunca crea nada por sí mismo — solo rellena
// el formulario para que el usuario revise y confirme antes de guardar.
const PROVEEDOR_SCHEMA = {
  type: "OBJECT",
  properties: {
    nombre: { type: "STRING", nullable: true },
    nit: { type: "STRING", nullable: true },
    contactoNombre: { type: "STRING", nullable: true },
    telefono: { type: "STRING", nullable: true },
    correo: { type: "STRING", nullable: true },
    servicio: { type: "STRING", nullable: true },
    descripcion: { type: "STRING", nullable: true },
    criticidad: { type: "STRING", nullable: true },
  },
  required: [],
};

/**
 * @openapi
 * /api/agent/proveedor-parse-texto:
 *   post:
 *     tags: [Agente IA]
 *     summary: Extrae los campos del formulario "Registrar proveedor" a partir de un texto pegado (típicamente un correo solicitando el registro) — requiere permiso "editProveedores".
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto: { type: string }
 *     responses:
 *       200:
 *         description: Campos extraídos (ver esquema interno).
 *       400:
 *         description: Falta el texto a interpretar.
 *       403:
 *         description: No autorizado.
 */
export async function POST(request) {
  const { denied } = await requirePermission("editProveedores");
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const texto = (body.texto || "").toString().trim();
  if (!texto) {
    return NextResponse.json({ error: "Pega el texto del correo para interpretarlo." }, { status: 400 });
  }

  const systemInstruction = `Extraes los datos de un proveedor nuevo a partir de un correo o texto libre (típicamente una solicitud de registro en SRM) para precargar un formulario. Responde solo con los datos del esquema, sin inventar información que no esté en el texto.

Reglas:
- "nombre": la razón social del proveedor (ej. "Nombre del proveedor: X S.A.S." → "X S.A.S."). null si no aparece.
- "nit": solo si el texto incluye un número de NIT explícito (no inventes uno a partir del nombre). null si no aparece.
- "contactoNombre": la persona de contacto indicada para el registro (ej. "Persona encargada... Nombre: X"). null si no aparece.
- "telefono": el teléfono de esa persona de contacto. null si no aparece.
- "correo": el correo electrónico de esa persona de contacto. null si no aparece.
- "servicio": qué vende o para qué sirve este proveedor (resume en pocas palabras el "motivo de la compra" o la naturaleza del servicio, ej. "Decoración y eventos corporativos"). null si no se puede inferir.
- "descripcion": una frase corta con qué vende este proveedor o para qué sirve (es obligatoria en el formulario; si no se puede inferir, usa el servicio mencionado en el texto). null solo si el texto no dice nada del proveedor.
- "criticidad": "Critico" si el texto sugiere que la falta de este proveedor afectaría operaciones críticas, "No crítico" en caso contrario. Si no hay información suficiente para decidir, responde null (no asumas).`;

  try {
    const campos = await generateStructuredJson({ systemInstruction, prompt: texto, schema: PROVEEDOR_SCHEMA });
    return NextResponse.json({ campos });
  } catch (err) {
    return apiError(err);
  }
}
