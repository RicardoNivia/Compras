// Núcleo de la valoración con IA de compras radicadas. Sin imports de Next (solo rutas relativas)
// para poder usarlo tanto desde la app (lib/valoraciones.js) como desde el script de carga
// masiva (scripts/valoraciones/valorarRegistrosRadicados.mjs). Recibe el cliente Prisma por parámetro.
//
// Qué hace: arma el contexto COMPLETO de una compra (todos los campos del registro, tiempos en días
// hábiles, datos del proveedor y sus compras anteriores con sus valoraciones y calificaciones), se lo
// pasa a la IA con una rúbrica y guarda el resultado: puntaje de la compra y del proveedor (1 a 5) con
// una observación que explica por qué.

import { generateAnthropicJson } from "./anthropic.js";
import { DEFAULT_ANTHROPIC_MODEL } from "./anthropicModels.js";
import { businessDaysBetween } from "./businessDays.js";

export const SLA_DIAS_HABILES = 8; // mismo plazo que usa el Dashboard y las Alertas
const UMBRAL_CARGA_HISTORICA = 30; // más registros que esto creados el mismo día = carga histórica
const MAX_PREVIAS_DETALLE = 15; // compras anteriores que se detallan a la IA (las estadísticas usan todas)

export const SCHEMA_VALORACION = {
  type: "OBJECT",
  properties: {
    puntajeCompra: { type: "NUMBER" },
    puntajeProveedor: { type: "NUMBER", nullable: true },
    resumen: { type: "STRING" },
    observacionCompra: { type: "STRING" },
    observacionProveedor: { type: "STRING", nullable: true },
    factores: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { factor: { type: "STRING" }, impacto: { type: "STRING" }, detalle: { type: "STRING" } },
        required: ["factor", "impacto", "detalle"],
      },
    },
  },
  required: ["puntajeCompra", "puntajeProveedor", "resumen", "observacionCompra", "observacionProveedor", "factores"],
};

// Criterios con los que se califica (escala, compra y proveedor). La misma constante la usa Nova (lib/appGuide.js)
// para explicar en qué parámetros se basan las valoraciones: si cambia la rúbrica, Nova queda al día sola.
export const CRITERIOS_VALORACION = `Referencia de la escala para la COMPRA (úsala para calibrar):
- 5: ejecutada y legalizada, entregada dentro del plazo, sin problemas en las observaciones y con registro completo.
- 4: lo anterior con un reparo menor (por ejemplo una observación leve, un dato faltante o un valor algo atípico).
- 3: reparos claros (entrega con retraso moderado, observaciones de problemas, legalización pendiente) pero la compra se cumplió.
- 2: incumplimientos importantes (retraso grande, faltantes, devoluciones, reclamos) o varios reparos a la vez.
- 1: compra fallida: anulada, rechazada o con problemas graves.
Una compra ejecutada, legalizada, entregada a tiempo y sin problemas NO debe quedar por debajo de 4. Los reparos se descuentan de forma proporcional a su gravedad; no apliques castigos desmedidos por un solo factor menor.

Cómo valorar la COMPRA (puntajeCompra):
- Cumplimiento del plazo: días hábiles entre solicitud y entrega frente al plazo de ${SLA_DIAS_HABILES} días hábiles (dentro del plazo suma; vencido resta, y más cuanto mayor sea el retraso). Una compra sin fecha de entrega no se puede evaluar en plazo: dilo.
- Oportunidad del registro: SOLO si el contexto trae "diasHabilesEntreSolicitudYRegistro". Si ese campo no viene (o "fechaDeRegistroConfiable" es false), la fecha de registro no es confiable porque es de una carga histórica: NO la uses ni la menciones como falla.
- Estado de la compra y de la legalización; si está anulada o con reparos, pesa en contra.
- Calidad del registro: descripción clara, categoría, medio de pago, número de factura (fe), valores completos; y lo que digan las observaciones (problemas, devoluciones, faltantes, retrasos, o confirmaciones de que todo salió bien).
- Razonabilidad del valor frente a compras anteriores del mismo proveedor y de la misma categoría (valor muy atípico = observación).
- Compras en USD: ten en cuenta la moneda y la TRM.

Cómo valorar al PROVEEDOR (puntajeProveedor): lo que importa es su DESEMPEÑO como proveedor: cumplimiento de plazos en esta compra y en las anteriores (porcentaje dentro del plazo y promedio de días), problemas o reclamos en las observaciones, anulaciones, razonabilidad de sus valores y las calificaciones humanas previas. Su situación administrativa en el módulo de Proveedores (documentos al día, estado del ciclo de actualización, tipo/criticidad) es un factor MENOR: puede restar como mucho un punto y nunca debe pesar más que el desempeño real en las compras. Con pocas compras previas, sé prudente y dilo: sin evidencia de problemas, un proveedor que cumplió debe quedar en 4 o 5. No uses el puntaje de la compra como único argumento. Si la compra no tiene proveedor, puntajeProveedor y observacionProveedor van en null.`;

export const INSTRUCCIONES_VALORACION = `Eres el analista de compras de Sinco. Valoras UNA compra ya radicada y, si tiene proveedor, también al proveedor, con una escala de 1 a 5 (5 = excelente, 4 = bueno, 3 = aceptable con reparos, 2 = deficiente, 1 = muy deficiente). Basas tu criterio ÚNICAMENTE en los datos que te entregan (ya calculados por el sistema: no recalcules fechas ni días hábiles) y en la comparación con las compras anteriores de ese mismo proveedor.

${CRITERIOS_VALORACION}

Devuelve:
- "puntajeCompra": entero de 1 a 5.
- "puntajeProveedor": entero de 1 a 5, o null.
- "resumen": 1-2 frases con la conclusión.
- "observacionCompra": 2-4 frases que expliquen POR QUÉ calificaste así la compra, citando los datos concretos (días hábiles, observaciones, valores, estado).
- "observacionProveedor": 2-4 frases que expliquen POR QUÉ calificaste así al proveedor, citando su historial (cuántas compras previas, cumplimiento, calificaciones anteriores); o null.
- "factores": 3 a 7 factores, cada uno con "factor" (nombre corto), "impacto" ("positivo", "neutro" o "negativo") y "detalle" (dato concreto).

Nunca inventes datos que no estén en el contexto; si algo falta, dilo en la observación. Responde en español, claro y específico, sin generalidades.`;

const fechaCorta = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function diasHabiles(desde, hasta) {
  if (!desde || !hasta) return null;
  const n = businessDaysBetween(String(desde).slice(0, 10), String(hasta).slice(0, 10));
  return Number.isFinite(n) ? n : null;
}

function resumenCompra(r, { conObservaciones = true } = {}) {
  const dias = diasHabiles(r.fechaSolicitud, r.fechaEntrega);
  return {
    fechaSolicitud: r.fechaSolicitud || null,
    fechaEntrega: r.fechaEntrega || null,
    diasHabilesHastaEntrega: dias,
    dentroDelPlazo: dias == null ? null : dias <= SLA_DIAS_HABILES,
    descripcion: r.descripcion || null,
    categoria: r.categoria || null,
    area: r.area || null,
    estado: r.estado || null,
    estadoLegalizacion: r.estadoLegalizacion || null,
    valorConIva: r.valorConIva ?? null,
    moneda: r.moneda || "COP",
    ...(conObservaciones ? { observaciones: r.observaciones || null } : {}),
  };
}

// Contexto completo de una compra radicada. prisma: cliente Prisma (el de la app o el del script).
export async function construirContexto(prisma, recordId) {
  const record = await prisma.record.findUnique({ where: { id: recordId }, include: { calificacion: true } });
  if (!record) {
    const err = new Error("Registro no encontrado.");
    err.status = 404;
    throw err;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  // Si muchísimos registros se crearon el mismo día, fue una carga histórica (migración): esa fecha de
  // registro no dice cuándo se registró realmente la compra y no debe usarse para evaluar oportunidad.
  const diaCreacion = new Date(record.createdAt).toISOString().slice(0, 10);
  const creadosEseDia = await prisma.record.count({
    where: { createdAt: { gte: new Date(`${diaCreacion}T00:00:00.000Z`), lt: new Date(new Date(`${diaCreacion}T00:00:00.000Z`).getTime() + 86400000) } },
  });
  const fechaRegistroConfiable = creadosEseDia <= UMBRAL_CARGA_HISTORICA;
  const diasEntrega = diasHabiles(record.fechaSolicitud, record.fechaEntrega);
  const compra = {
    ...resumenCompra(record),
    numero: record.localSeq ?? null,
    informe: record.informe || null,
    responsable: record.responsable || null,
    medioPago: record.medioPago || null,
    licitacion: record.licitacion || null,
    numeroFactura: record.fe || null,
    valorSinIva: record.valorSinIva ?? null,
    valorCotizado: record.valorCot ?? null,
    valorUsd: record.valorUsd ?? null,
    trm: record.trm ?? null,
    radicado: record.radicado,
    ...(fechaRegistroConfiable
      ? { fechaRegistroEnElSistema: fechaCorta(record.createdAt), diasHabilesEntreSolicitudYRegistro: diasHabiles(record.fechaSolicitud, fechaCorta(record.createdAt)) }
      : { fechaDeRegistroConfiable: false }),
    diasHabilesSinEntregarAHoy: record.fechaEntrega ? null : diasHabiles(record.fechaSolicitud, hoy),
    plazoDiasHabiles: SLA_DIAS_HABILES,
    calificacionHumanaDelProveedor: record.calificacion ? { estrellas: record.calificacion.estrellas, comentario: record.calificacion.comentario || null } : null,
  };

  let proveedor = null;
  let previas = { total: 0 };
  let detallePrevias = [];
  if (record.proveedorNit) {
    const p = await prisma.proveedor.findUnique({
      where: { nit: record.proveedorNit },
      include: { ciclos: { orderBy: { anio: "desc" }, take: 1 } },
    });
    if (p) {
      proveedor = {
        nit: p.nit,
        nombre: p.nombre,
        descripcion: p.descripcion,
        tipoCriticidad: p.criticidad || "Sin definir",
        clasificacionPorMonto: p.clasificacionMonto || null,
        area: p.area || null,
        tipoServicio: p.servicio || null,
        activo: p.activo,
        motivoInactivo: p.activo ? null : p.inactivoMotivo || null,
        excepcion: p.esExcepcion,
        motivoExcepcion: p.esExcepcion ? p.motivoExcepcion || null : null,
        fechaUltimaActualizacion: p.esExcepcion ? "No aplica (excepción)" : fechaCorta(p.fechaActualizacion),
        estadoCicloVigente: p.ciclos[0] ? { anio: p.ciclos[0].anio, estado: p.ciclos[0].estado } : null,
      };
    }

    // Compras ANTERIORES a esta con el mismo proveedor (fecha de solicitud anterior; si empatan, las de menor número).
    const where = { proveedorNit: record.proveedorNit, id: { not: record.id } };
    if (record.fechaSolicitud) where.fechaSolicitud = { lt: record.fechaSolicitud };
    const todas = await prisma.record.findMany({
      where,
      orderBy: { fechaSolicitud: "desc" },
      include: { calificacion: true },
      take: 500,
    });

    const conEntrega = todas.filter((r) => r.fechaEntrega && r.fechaSolicitud);
    const dias = conEntrega.map((r) => diasHabiles(r.fechaSolicitud, r.fechaEntrega)).filter((d) => d != null);
    const dentro = dias.filter((d) => d <= SLA_DIAS_HABILES).length;
    const misma = todas.filter((r) => record.categoriaId && r.categoriaId === record.categoriaId && r.valorConIva != null);
    const estrellas = todas.filter((r) => r.calificacion).map((r) => r.calificacion.estrellas);
    const prom = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    previas = {
      total: todas.length,
      conFechaDeEntrega: dias.length,
      porcentajeDentroDelPlazo: dias.length ? Math.round((dentro / dias.length) * 100) : null,
      promedioDiasHabilesHastaEntrega: prom(dias),
      maximoDiasHabilesHastaEntrega: dias.length ? Math.max(...dias) : null,
      valorPromedioConIvaTodasLasCompras: prom(todas.filter((r) => r.valorConIva != null).map((r) => r.valorConIva)),
      valorPromedioConIvaMismaCategoria: misma.length ? prom(misma.map((r) => r.valorConIva)) : null,
      comprasAnuladas: todas.filter((r) => r.estado === "Anulado").length,
      calificacionesHumanasPromedioEstrellas: prom(estrellas),
      primeraCompra: todas.length ? todas[todas.length - 1].fechaSolicitud : null,
    };
    detallePrevias = todas.slice(0, MAX_PREVIAS_DETALLE).map((r) => ({
      ...resumenCompra(r),
      calificacionHumanaEstrellas: r.calificacion?.estrellas ?? null,
    }));
  }

  return {
    recordId,
    tieneProveedor: !!record.proveedorNit,
    contexto: { fechaDeHoy: hoy, compraAValorar: compra, proveedor, historialConElProveedor: previas, ultimasComprasAnterioresConElProveedor: detallePrevias },
    comprasPrevias: previas.total,
  };
}

const clamp15 = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(5, Math.max(1, v)) : null;
};

const texto = (v, max = 4000) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

// Valida y normaliza la respuesta de la IA (puntajes enteros 1..5, textos acotados).
export function normalizarResultado(raw, tieneProveedor) {
  const puntajeCompra = clamp15(raw?.puntajeCompra);
  if (!puntajeCompra) throw new Error("La IA no devolvió un puntaje válido para la compra.");
  const factores = (Array.isArray(raw.factores) ? raw.factores : [])
    .map((f) => ({
      factor: texto(f?.factor, 120),
      impacto: ["positivo", "neutro", "negativo"].includes(String(f?.impacto).toLowerCase()) ? String(f.impacto).toLowerCase() : "neutro",
      detalle: texto(f?.detalle, 500),
    }))
    .filter((f) => f.factor && f.detalle)
    .slice(0, 8);
  return {
    puntajeCompra,
    puntajeProveedor: tieneProveedor ? clamp15(raw?.puntajeProveedor) : null,
    resumen: texto(raw.resumen, 600) || "Sin resumen.",
    observacionCompra: texto(raw.observacionCompra) || "Sin observación.",
    observacionProveedor: tieneProveedor ? texto(raw.observacionProveedor) : null,
    factores,
  };
}

// Llama a la IA (por defecto Anthropic con la API key del entorno) y devuelve el resultado normalizado.
export async function valorarConIA(ctx, { generar = generateAnthropicJson, model = DEFAULT_ANTHROPIC_MODEL, timeoutMs = 60000 } = {}) {
  const raw = await generar({
    model,
    systemInstruction: INSTRUCCIONES_VALORACION,
    prompt: JSON.stringify(ctx.contexto),
    schema: SCHEMA_VALORACION,
    timeoutMs,
  });
  return { ...normalizarResultado(raw, ctx.tieneProveedor), modelo: model, comprasPrevias: ctx.comprasPrevias };
}

// Guarda (upsert por registro). Devuelve { antes, despues } para auditoría.
export async function guardarValoracion(prisma, recordId, resultado, { actor = null, origen = "radicacion" } = {}) {
  const antes = await prisma.valoracionCompra.findUnique({ where: { recordId } });
  const data = {
    puntajeCompra: resultado.puntajeCompra,
    puntajeProveedor: resultado.puntajeProveedor,
    resumen: resultado.resumen,
    observacionCompra: resultado.observacionCompra,
    observacionProveedor: resultado.observacionProveedor,
    factores: resultado.factores?.length ? JSON.stringify(resultado.factores) : null,
    comprasPrevias: resultado.comprasPrevias ?? 0,
    modelo: resultado.modelo || null,
    origen,
    creadoPorUserId: actor?.id || null,
    creadoPorNombre: actor?.nombre || (origen === "carga masiva" ? "Valoración masiva" : null),
  };
  const despues = await prisma.valoracionCompra.upsert({ where: { recordId }, update: data, create: { recordId, ...data } });
  return { antes, despues };
}

// Forma que se entrega al cliente.
export function toClientValoracion(v) {
  if (!v) return null;
  let factores = [];
  try {
    factores = v.factores ? JSON.parse(v.factores) : [];
  } catch {
    factores = [];
  }
  return {
    id: v.id,
    recordId: v.recordId,
    puntajeCompra: v.puntajeCompra,
    puntajeProveedor: v.puntajeProveedor,
    resumen: v.resumen,
    observacionCompra: v.observacionCompra,
    observacionProveedor: v.observacionProveedor,
    factores,
    comprasPrevias: v.comprasPrevias,
    modelo: v.modelo,
    origen: v.origen,
    creadoPorNombre: v.creadoPorNombre,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function valorarConReintentos(ctx, opciones) {
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      return await valorarConIA(ctx, opciones);
    } catch (err) {
      ultimo = err;
      if (/\b(401|403)\b/.test(err.message)) throw err; // clave inválida: no tiene sentido reintentar
      await dormir(2000 * intento);
    }
  }
  throw ultimo;
}

// Valora en lote las compras radicadas que aún no tienen valoración (o todas con reintentar=true).
// Procesa cada proveedor en orden cronológico (de la más antigua a la más nueva) para que cada compra
// pueda apoyarse en las valoraciones de sus compras anteriores; los proveedores van en paralelo.
// Es idempotente: lo ya valorado se omite. Lo usan el proceso automático al arrancar el backend
// (lib/valoracionAuto.js) y el script manual (scripts/valoraciones/valorarRegistrosRadicados.mjs).
export async function valorarPendientes(prisma, {
  reintentar = false, limite = 0, concurrencia = 2, soloRegistro = null, origen = "carga masiva",
  omitir = new Set(), pausaMs = 300, timeoutMs = 90000, generar, log = () => {}, soloContar = false,
} = {}) {
  const where = { radicado: true, ...(soloRegistro ? { id: soloRegistro } : {}), ...(reintentar ? {} : { valoracion: null }) };
  let registros = await prisma.record.findMany({
    where,
    select: { id: true, localSeq: true, proveedorNit: true },
    orderBy: [{ fechaSolicitud: "asc" }, { localSeq: "asc" }],
  });
  registros = registros.filter((r) => !omitir.has(r.id));
  if (limite) registros = registros.slice(0, limite);

  const resumen = { pendientes: registros.length, hechos: 0, errores: [], distribucion: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, sumaCompra: 0, sumaProveedor: 0, nProveedor: 0 };
  if (soloContar || !registros.length) return resumen;

  const carriles = new Map();
  for (const r of registros) {
    const k = r.proveedorNit || `sin-proveedor-${r.id}`;
    if (!carriles.has(k)) carriles.set(k, []);
    carriles.get(k).push(r);
  }
  const cola = [...carriles.values()];
  const opcionesIA = { timeoutMs, ...(generar ? { generar } : {}) };

  async function trabajador() {
    while (cola.length) {
      const carril = cola.shift();
      for (const r of carril) {
        try {
          const ctx = await construirContexto(prisma, r.id);
          const res = await valorarConReintentos(ctx, opcionesIA);
          await guardarValoracion(prisma, r.id, res, { actor: null, origen });
          resumen.hechos++;
          resumen.sumaCompra += res.puntajeCompra;
          resumen.distribucion[res.puntajeCompra]++;
          if (res.puntajeProveedor != null) { resumen.sumaProveedor += res.puntajeProveedor; resumen.nProveedor++; }
          if (resumen.hechos % 10 === 0 || resumen.hechos === registros.length) log(`${resumen.hechos}/${registros.length} compras valoradas`);
        } catch (err) {
          resumen.errores.push({ id: r.id, numero: r.localSeq, error: err.message });
          log(`registro #${r.localSeq ?? r.id}: ${err.message}`);
          if (/\b(401|403)\b/.test(err.message)) { cola.length = 0; return; } // clave inválida: se detiene todo
        }
        if (pausaMs) await dormir(pausaMs);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrencia) }, trabajador));
  return resumen;
}
