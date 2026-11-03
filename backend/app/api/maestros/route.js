import { NextResponse } from "next/server";
import { listMaestros, createMaestro, MODULO_POR_TIPO } from "@/lib/maestros";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { getSessionUser } from "@/lib/auth-server";
import { ROLES_COMPRAS } from "@/lib/roles";
import { isRoleAllowed } from "@/lib/permissions";

const FEATURES_BIENESTAR = ["viewBienestar", "editBienestar", "viewFundacion", "editFundacion", "viewMaestrosBienestar"];

// Sin chequeo de rol más allá de estar autenticado (lo garantiza el
// middleware): cualquier rol que pueda editar registros necesita leer estas
// listas para poblar los <select> del formulario.
/**
 * @openapi
 * /api/maestros:
 *   get:
 *     tags: [Maestros]
 *     summary: Lista los valores de las listas maestras (área, responsable, estado, categoría, medio de pago, estado de legalización) — cualquier usuario autenticado.
 *     parameters:
 *       - { name: tipo, in: query, schema: { type: string, enum: [area, responsable, estado, categoria, medioPago, estadoLegalizacion, causaCalificacion, areaProveedor, tipoProveedor, clasificacionMonto, tipoServicio, motivoExcepcion] } }
 *       - { name: onlyActive, in: query, schema: { type: string, enum: ["1"] }, description: "\"1\" para devolver solo los activos." }
 *     responses:
 *       200:
 *         description: Maestros.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 maestros:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       tipo: { type: string }
 *                       valor: { type: string }
 *                       activo: { type: boolean }
 *                       enUso: { type: boolean, description: "Si el valor está usado hoy en algún registro." }
 *                       createdAt: { type: string, format: date-time }
 *       400:
 *         description: Tipo de maestro inválido.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") || undefined;
  const onlyActive = searchParams.get("onlyActive") === "1";
  try {
    const user = await getSessionUser();
    const maestros = await listMaestros({ tipo, onlyActive });
    // Los roles de Compras ven todos. Los demás ven los de Proveedores y, si tienen algo de Bienestar o Fundación,
    // los de Bienestar (responsables, áreas, motivos, unidades y escala llenan los formularios de las actividades).
    let visibles = maestros;
    if (user && !ROLES_COMPRAS.includes(user.role)) {
      const modulos = new Set(["Proveedores"]);
      for (const f of FEATURES_BIENESTAR) {
        if (await isRoleAllowed(user.role, f)) { modulos.add("Bienestar"); break; }
      }
      visibles = maestros.filter((m) => modulos.has(MODULO_POR_TIPO[m.tipo]));
    }
    return NextResponse.json({ maestros: visibles });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/maestros:
 *   post:
 *     tags: [Maestros]
 *     summary: Crea un valor de lista maestra (requiere permiso "viewMaestros").
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tipo, valor]
 *             properties:
 *               tipo: { type: string, enum: [area, responsable, estado, categoria, medioPago, estadoLegalizacion, causaCalificacion, areaProveedor, tipoProveedor, clasificacionMonto, tipoServicio, motivoExcepcion] }
 *               valor: { type: string }
 *               activo: { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Maestro creado.
 *         content:
 *           application/json:
 *             schema: { type: object, description: "Ver schema de maestro en GET /api/maestros." }
 *       400:
 *         description: Datos inválidos, o valor ya existente para ese tipo.
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
  const { user, denied } = await requireAlgunPermiso(["viewMaestros", "viewMaestrosBienestar"]);
  if (denied) return denied;
  try {
    const body = await request.json();
    const maestro = await createMaestro(body, user);
    return NextResponse.json(maestro, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
