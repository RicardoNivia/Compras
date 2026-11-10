import { NextResponse } from "next/server";
import { listProveedores, createProveedor } from "@/lib/proveedores";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getSessionUser } from "@/lib/auth-server";

// Sin chequeo de permiso más allá de estar autenticado (lo garantiza el
// middleware): cualquier rol que pueda editar registros necesita leer este
// catálogo para el autocompletar de proveedor en el formulario.
/**
 * @openapi
 * /api/proveedores:
 *   get:
 *     tags: [Proveedores]
 *     summary: Lista el catálogo de proveedores (nit + nombre) — cualquier usuario autenticado.
 *     parameters:
 *       - { name: onlyActive, in: query, schema: { type: string, enum: ["1"] }, description: "\"1\" para devolver solo los activos." }
 *       - { name: search, in: query, schema: { type: string }, description: "Filtra por nit o nombre (para el autocompletar)." }
 *     responses:
 *       200:
 *         description: Proveedores.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 proveedores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       nit: { type: string, description: "Llave primaria del proveedor; Record.proveedorNit la referencia (FK ON UPDATE CASCADE)." }
 *                       nombre: { type: string }
 *                       descripcion: { type: string }
 *                       telefono: { type: string, nullable: true }
 *                       correo: { type: string, nullable: true }
 *                       activo: { type: boolean }
 *                       enUso: { type: boolean, description: "Si el NIT está usado hoy en algún registro." }
 *                       tipoProveedorId: { type: string, nullable: true }
 *                       clasificacionMontoId: { type: string, nullable: true }
 *                       tipoServicioId: { type: string, nullable: true }
 *                       esExcepcion: { type: boolean }
 *                       fechaActualizacion: { type: string, format: date-time, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const onlyActive = searchParams.get("onlyActive") === "1";
  const search = searchParams.get("search") || undefined;
  try {
    const proveedores = await listProveedores({ onlyActive, search });
    return NextResponse.json({ proveedores });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/proveedores:
 *   post:
 *     tags: [Proveedores]
 *     summary: Crea un proveedor (requiere permiso "editProveedores").
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nit, nombre, descripcion]
 *             properties:
 *               nit: { type: string, description: "Sin dígito de verificación." }
 *               nombre: { type: string }
 *               descripcion: { type: string, description: "Qué vende/para qué sirve este proveedor." }
 *               telefono: { type: string, description: "Opcional." }
 *               correo: { type: string, description: "Opcional." }
 *               activo: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Proveedor creado.
 *         content:
 *           application/json:
 *             schema: { type: object, description: "Ver schema de proveedor en GET /api/proveedores." }
 *       400:
 *         description: Datos inválidos, o nit ya existente.
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
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json();
    const proveedor = await createProveedor(body, user);
    return NextResponse.json(proveedor, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
