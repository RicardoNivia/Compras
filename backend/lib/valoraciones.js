import { prisma } from "@/lib/prisma";
import { logValoracionUpsert } from "@/lib/audit";
import { generateStructuredJson } from "@/lib/aiStructured";
import { construirContexto, valorarConIA, guardarValoracion, toClientValoracion } from "@/lib/valoracionIA";

// Valoración con IA de compras radicadas (ver lib/valoracionIA.js para el núcleo). Esta capa agrega
// la sesión, la auditoría y las consultas que usan la tabla de Registros y el detalle de Proveedores.

function conStatus(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export async function getValoracionDeRegistro(recordId) {
  return toClientValoracion(await prisma.valoracionCompra.findUnique({ where: { recordId } }));
}

// Genera (o vuelve a generar) la valoración de una compra YA radicada y la guarda.
export async function valorarRegistro(recordId, actor, { origen = "radicacion" } = {}) {
  const record = await prisma.record.findUnique({ where: { id: recordId }, select: { id: true, radicado: true, localSeq: true, descripcion: true } });
  if (!record) throw conStatus("Registro no encontrado.", 404);
  if (!record.radicado) throw conStatus("Solo se pueden valorar compras ya radicadas.", 409);

  const ctx = await construirContexto(prisma, recordId);
  // generateStructuredJson usa la API key del servidor (ANTHROPIC_API_KEY) y el modelo por defecto.
  const resultado = await valorarConIA(ctx, { generar: ({ systemInstruction, prompt, schema, timeoutMs }) => generateStructuredJson({ systemInstruction, prompt, schema, budgetMs: timeoutMs, cache: false }) });
  const { antes, despues } = await guardarValoracion(prisma, recordId, resultado, { actor, origen });

  const info = `Registro ${record.localSeq ? `#${record.localSeq}` : record.id}${record.descripcion ? ` · ${String(record.descripcion).slice(0, 60)}` : ""}`;
  await logValoracionUpsert(actor, toClientValoracion(antes), toClientValoracion(despues), info).catch(() => {});
  return toClientValoracion(despues);
}

const promedio = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// Calificación general de cada proveedor = promedio del puntaje de proveedor de sus compras valoradas.
export async function valoracionGeneralPorProveedor() {
  const rows = await prisma.valoracionCompra.findMany({
    where: { puntajeProveedor: { not: null }, record: { proveedorNit: { not: null } } },
    select: { puntajeProveedor: true, record: { select: { proveedorNit: true } } },
  });
  const porNit = new Map();
  for (const r of rows) {
    const nit = r.record.proveedorNit;
    if (!porNit.has(nit)) porNit.set(nit, []);
    porNit.get(nit).push(r.puntajeProveedor);
  }
  return new Map([...porNit].map(([nit, xs]) => [nit, { promedio: promedio(xs), cantidad: xs.length }]));
}

// Historial de compras de un proveedor con su valoración y la calificación general.
export async function historialComprasProveedor(nit) {
  const proveedor = await prisma.proveedor.findUnique({ where: { nit }, select: { nit: true, nombre: true } });
  if (!proveedor) throw conStatus("Proveedor no encontrado.", 404);

  const registros = await prisma.record.findMany({
    where: { proveedorNit: nit },
    orderBy: [{ fechaSolicitud: "desc" }, { localSeq: "desc" }],
    include: { valoracion: true, calificacion: true },
  });

  const valoradas = registros.filter((r) => r.valoracion);
  const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of valoradas) if (r.valoracion.puntajeProveedor) distribucion[r.valoracion.puntajeProveedor]++;

  return {
    proveedor,
    general: {
      promedioProveedor: promedio(valoradas.map((r) => r.valoracion.puntajeProveedor).filter((x) => x != null)),
      promedioCompras: promedio(valoradas.map((r) => r.valoracion.puntajeCompra)),
      comprasValoradas: valoradas.length,
      comprasTotales: registros.length,
      radicadasSinValorar: registros.filter((r) => r.radicado && !r.valoracion).length,
      distribucion,
    },
    compras: registros.map((r) => ({
      id: r.id,
      numero: r.localSeq,
      fechaSolicitud: r.fechaSolicitud,
      fechaEntrega: r.fechaEntrega,
      descripcion: r.descripcion,
      area: r.area,
      categoria: r.categoria,
      estado: r.estado,
      valorConIva: r.valorConIva,
      moneda: r.moneda || "COP",
      observaciones: r.observaciones,
      radicado: r.radicado,
      calificacionHumana: r.calificacion ? r.calificacion.estrellas : null,
      valoracion: toClientValoracion(r.valoracion),
    })),
  };
}
