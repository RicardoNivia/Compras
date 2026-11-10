import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { listRecords } from "@/lib/records";

/**
 * @openapi
 * /api/agentes-compras/compras:
 *   get:
 *     tags: [Agentes de Compras]
 *     summary: "Busca compras por número (#) o texto (?q=) para elegirlas en los agentes (verificar factura, adjuntar un cuadro). Máximo 30."
 *     responses:
 *       200: { description: "{ compras }" }
 */
export async function GET(request) {
  const { denied } = await requireAlgunPermiso(["viewAgentesCompras"]);
  if (denied) return denied;
  try {
    const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase().replace(/^#/, "");
    const n = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const todas = (await listRecords()).sort((a, b) => (b.localSeq || 0) - (a.localSeq || 0));
    const hit = !q ? todas : todas.filter((r) => String(r.localSeq) === q || n(`${r.descripcion} ${r.proveedor} ${r.fe}`).includes(n(q)));
    return NextResponse.json({ compras: hit.slice(0, 30).map((r) => ({ id: r.id, numero: r.localSeq, fecha: r.fechaSolicitud, descripcion: r.descripcion, proveedor: r.proveedor, valor: r.valorConIva, fe: r.fe, estadoLegalizacion: r.estadoLegalizacion })) });
  } catch (err) {
    return apiError(err);
  }
}
