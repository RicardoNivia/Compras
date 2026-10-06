import { NextResponse } from "next/server";
import { listRecords, createRecord, getMeta } from "@/lib/records";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

/**
 * @openapi
 * /api/records:
 *   get:
 *     tags: [Registros]
 *     summary: Lista todos los registros de compra, junto con el meta (fuente/secuencia).
 *     responses:
 *       200:
 *         description: Registros y meta.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 records:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Record' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     sourceFile: { type: string, nullable: true }
 *                     sourceSheet: { type: string, nullable: true }
 *                     nextLocalSeq: { type: integer }
 */
export async function GET() {
  const [records, meta] = await Promise.all([listRecords(), getMeta()]);
  return NextResponse.json({ records, meta });
}

/**
 * @openapi
 * /api/records:
 *   post:
 *     tags: [Registros]
 *     summary: Crea un registro de compra (requiere permiso "createRecord").
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Record' }
 *     responses:
 *       201:
 *         description: Registro creado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Record' }
 *       400:
 *         description: Datos inválidos.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "createRecord"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const record = await createRecord(body, user);
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
