import { TOOLS_TESORERIA, NOMBRES_TESORERIA, ejecutarTesoreria } from "@/lib/tesoreria/novaTesoreria";
import { listRecords } from "@/lib/records";
import { listPresupuestos } from "@/lib/presupuestos";
import { listAuditLogs } from "@/lib/audit";
import { buildAggregates } from "@/lib/reportContent";
import { listMaestroProveedores, getProveedorDetalle, indicadoresCiclo } from "@/lib/proveedoresCiclo";
import { prisma } from "@/lib/prisma";
import { getPendientesParaNova } from "@/lib/pendientes";
import { CONSULTAR_REFERENCIA_TOOL, consultarReferencia } from "@/lib/referenciasNova";
import { getActividad, listActividades, resumenBienestar } from "@/lib/actividadesBienestar";
import { isRoleAllowed } from "@/lib/permissions";
import { listFotos } from "@/lib/fotosBienestar";
import { hoyColombia } from "@/lib/hoyColombia";

// Herramientas ("tool use" de Anthropic) que el Agente IA del chat puede
// invocar bajo demanda en vez de recibir TODO el dataset de compras en cada
// mensaje (ver app/api/agent/chat/route.js). Esto resuelve dos problemas del
// diseño anterior: (1) preguntas puntuales ya no cargan los ~500 registros
// completos solo para citar un dato, y (2) preguntas generales ("análisis de
// todas las compras") ya no dependen de que el modelo sume/calcule cientos de
// registros él mismo en su respuesta (lento y propenso a error) — en vez de
// eso, "resumen_compras" calcula los totales exactos del lado del servidor
// sobre el 100% de los datos, sin importar cuántos registros haya.

// Límites moderados: cada registro devuelto se vuelve a cobrar en cada vuelta siguiente de la conversación.
const ENTIDADES_OCULTAS_A_NOVA = ["tokenAcceso", "mcp"];
const MAX_BUSCAR_LIMIT = 50;
const DEFAULT_BUSCAR_LIMIT = 20;

function norm(v) {
  return (v || "").toString().trim().toLowerCase();
}

// Texto sin tildes ni mayúsculas, para comparar nombres de maestros y búsquedas libres.
function normTxt(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function contiene(valor, buscado) {
  return !buscado || normTxt(valor).includes(normTxt(buscado));
}

function fechaISO(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : null;
}

function enRango(fecha, desde, hasta) {
  if (!desde && !hasta) return true;
  const d = fechaISO(fecha);
  if (!d) return false;
  return (!desde || d >= desde) && (!hasta || d <= hasta);
}

// Ficha de un proveedor con TODOS sus campos de gestión, para responder cualquier pregunta sobre ellos.
function proveedorParaChat(p) {
  return {
    nit: p.nit,
    nombre: p.nombre,
    descripcion: p.descripcion,
    tipoCriticidad: p.criticidad || "Sin definir",
    clasificacionPorMonto: p.clasificacionMonto || null,
    area: p.area || null,
    tipoServicio: p.servicio || null,
    excepcion: !!p.esExcepcion,
    motivoExcepcion: p.esExcepcion ? p.motivoExcepcion || null : null,
    justificacionExcepcion: p.esExcepcion ? p.justificacionExcepcion || null : null,
    activo: p.activo,
    motivoInactivo: p.activo ? null : p.inactivoMotivo || null,
    clasificacionCiclo: p.clasificacionLabel || null,
    estadoCiclo: p.ciclo?.estadoLabel || null,
    fechaUltimaActualizacion: p.esExcepcion ? "No aplica (excepción)" : fechaISO(p.fechaActualizacion),
    fechaRegistro: fechaISO(p.createdAt),
    registradoPor: p.creadoPorNombre || null,
    telefono: p.telefono || null,
    correo: p.correo || null,
    observacion: p.observacion || null,
    checklist: p.checklist ? `${p.checklist.completos}/${p.checklist.total}` : null,
    checklistFaltan: p.checklist?.faltan || [],
    alertaCompras: p.alerta?.titulo || null,
  };
}

// Campos por los que buscar_proveedores_gestion puede agrupar y contar.
const AGRUPACIONES_PROVEEDOR = {
  area: (p) => p.area || "Sin área",
  tipoServicio: (p) => p.servicio || "Sin tipo de servicio",
  clasificacionMonto: (p) => p.clasificacionMonto || "Sin clasificación",
  criticidad: (p) => p.criticidad || "Sin definir",
  clasificacion: (p) => p.clasificacionLabel || p.clasificacion,
  estadoCiclo: (p) => p.ciclo?.estadoLabel || "Sin estado en el ciclo",
  excepcion: (p) => (p.esExcepcion ? "Excepción" : "No es excepción"),
  motivoExcepcion: (p) => (p.esExcepcion ? p.motivoExcepcion || "Sin motivo" : "No es excepción"),
  activo: (p) => (p.activo ? "Activo" : "Inactivo"),
  mesUltimaActualizacion: (p) => (p.fechaActualizacion ? fechaISO(p.fechaActualizacion).slice(0, 7) : "Sin fecha"),
  mesRegistro: (p) => (p.createdAt ? fechaISO(p.createdAt).slice(0, 7) : "Sin fecha"),
};

// Los campos de catálogo (área, categoría, estado…) se filtraban por nombre EXACTO: "imprevistos administrativos" no
// encontraba la categoría "Imprevistos Administrativos (TIT)" y Nova respondía "0 compras". Ahora, si no hay un valor
// exactamente igual (sin tildes ni mayúsculas), valen los valores que contienen TODAS las palabras pedidas; y si
// tampoco hay, se devuelven los nombres parecidos para que Nova pregunte o reintente con el correcto.
const CAMPOS_CATALOGO = { area: "área", categoria: "categoría", estado: "estado", medioPago: "medio de pago", estadoLegalizacion: "estado de legalización" };
function resolverFiltros(records, f) {
  const filtros = { ...f, _aceptados: {} };
  const notas = [];
  for (const [campo, etiqueta] of Object.entries(CAMPOS_CATALOGO)) {
    if (!f[campo]) continue;
    const pedido = normTxt(f[campo]);
    const valores = new Map();
    for (const r of records) if (r[campo]) valores.set(normTxt(r[campo]), r[campo]);
    if (valores.has(pedido)) { filtros._aceptados[campo] = new Set([pedido]); continue; }
    const palabras = pedido.split(" ").filter((w) => w.length > 2);
    const parecidos = [...valores.keys()].filter((v) => palabras.length && palabras.every((w) => v.includes(w)));
    filtros._aceptados[campo] = new Set(parecidos);
    if (parecidos.length) {
      notas.push(`La ${etiqueta} «${f[campo]}» no existe con ese nombre exacto; se tomó como: ${parecidos.map((v) => `«${valores.get(v)}»`).join(", ")}.`);
    } else {
      const alguna = [...valores.keys()].filter((v) => palabras.some((w) => v.includes(w))).slice(0, 8).map((v) => valores.get(v));
      notas.push(`No hay ninguna ${etiqueta} llamada «${f[campo]}».${alguna.length ? ` Nombres parecidos que sí existen: ${alguna.map((v) => `«${v}»`).join(", ")}. Reintenta con el que corresponda o pregúntale al usuario cuál quiere.` : ""}`);
    }
  }
  return { filtros, notas };
}

function matchesFilters(r, f) {
  const ok = (campo) => (f._aceptados?.[campo] ? f._aceptados[campo].has(normTxt(r[campo])) : norm(r[campo]) === norm(f[campo]));
  if (f.area && !ok("area")) return false;
  if (f.estado && !ok("estado")) return false;
  if (f.categoria && !ok("categoria")) return false;
  if (f.proveedor && !norm(r.proveedor).includes(norm(f.proveedor))) return false;
  if (f.descripcion && !norm(r.descripcion).includes(norm(f.descripcion))) return false;
  if (f.medioPago && !ok("medioPago")) return false;
  if (f.estadoLegalizacion && !ok("estadoLegalizacion")) return false;
  if (f.fechaDesde && (!r.fechaSolicitud || r.fechaSolicitud < f.fechaDesde)) return false;
  if (f.fechaHasta && (!r.fechaSolicitud || r.fechaSolicitud > f.fechaHasta)) return false;
  if (f.valorMin != null && (r.valorConIva || 0) < f.valorMin) return false;
  if (f.valorMax != null && (r.valorConIva || 0) > f.valorMax) return false;
  return true;
}

function compactRecordForChat(r) {
  return {
    fechaSolicitud: r.fechaSolicitud,
    fechaEntrega: r.fechaEntrega,
    area: r.area,
    responsable: r.responsable,
    estado: r.estado,
    categoria: r.categoria,
    descripcion: r.descripcion,
    medioPago: r.medioPago,
    estadoLegalizacion: r.estadoLegalizacion,
    proveedor: r.proveedor,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    radicado: r.radicado,
  };
}

// Presupuesto por área y año (modo "area": un total; modo "categoria":
// desglosado por categoría, el total del área es la suma) + lo gastado hasta
// ahora en cada uno. Solo cuenta registros no anulados, igual que el Dashboard.
function buildPresupuestoResumen(records, presupuestos, filters) {
  const gastadoPorAreaAnio = new Map();
  const gastadoPorAreaAnioCategoria = new Map();
  for (const r of records) {
    if (r.estado === "Anulado" || !r.fechaSolicitud) continue;
    const area = r.area || "Sin área";
    const anio = r.fechaSolicitud.slice(0, 4);
    const valor = r.valorConIva || 0;
    const keyArea = `${area}||${anio}`;
    gastadoPorAreaAnio.set(keyArea, (gastadoPorAreaAnio.get(keyArea) || 0) + valor);
    const categoria = r.categoria || "Sin categoría";
    const keyCat = `${keyArea}||${categoria}`;
    gastadoPorAreaAnioCategoria.set(keyCat, (gastadoPorAreaAnioCategoria.get(keyCat) || 0) + valor);
  }

  const areas = presupuestos
    .filter((p) => !filters.area || norm(p.area) === norm(filters.area))
    .filter((p) => !filters.anio || Number(p.anio) === Number(filters.anio))
    .map((p) => {
      const gastado = gastadoPorAreaAnio.get(`${p.area}||${String(p.anio)}`) || 0;
      const categorias = p.modo === "categoria"
        ? p.categorias.map((c) => {
            const g = gastadoPorAreaAnioCategoria.get(`${p.area}||${String(p.anio)}||${c.categoria}`) || 0;
            return { categoria: c.categoria, presupuesto: c.valor, gastado: g, disponible: c.valor - g };
          })
        : [];
      return {
        area: p.area,
        anio: p.anio,
        modo: p.modo,
        presupuestoTotal: p.total,
        gastadoAcumulado: gastado,
        disponible: p.total - gastado,
        pctConsumido: p.total ? Number(((gastado / p.total) * 100).toFixed(1)) : null,
        categorias,
      };
    });

  // Totales y ranking ya calculados: Nova no debe sumar ni calcular porcentajes por su cuenta.
  const porAnio = new Map();
  for (const a of areas) {
    const t = porAnio.get(a.anio) || { anio: a.anio, presupuestoTotal: 0, gastado: 0, areas: 0 };
    t.presupuestoTotal += a.presupuestoTotal || 0;
    t.gastado += a.gastadoAcumulado || 0;
    t.areas++;
    porAnio.set(a.anio, t);
  }
  const totalesPorAnio = [...porAnio.values()].map((t) => ({ ...t, disponible: t.presupuestoTotal - t.gastado, pctConsumido: t.presupuestoTotal ? Number(((t.gastado / t.presupuestoTotal) * 100).toFixed(1)) : null }));
  const masConsumidas = [...areas].filter((a) => a.pctConsumido != null).sort((a, b) => b.pctConsumido - a.pctConsumido).slice(0, 10).map((a) => ({ area: a.area, anio: a.anio, pctConsumido: a.pctConsumido }));
  return {
    totalesPorAnio,
    masConsumidas,
    areas,
    nota: "Usa totalesPorAnio y masConsumidas tal cual (ya están calculados). Cada entrada tiene su propio año ('anio'). Si un área/año no aparece aquí, es porque no se le ha configurado presupuesto — dilo así, no asumas que es cero. Este es el presupuesto de COMPRAS por área; el presupuesto de cada actividad de Bienestar está en resumen_bienestar (presupuestoDeActividades).",
  };
}

function buildAuditoriaResumen(logs) {
  return logs.map((l) => ({
    fecha: l.createdAt,
    accion: l.action,
    entidad: l.entityType,
    detalle: l.recordInfo,
    usuario: l.userNombre || l.userEmail || "(usuario eliminado)",
    cambios: l.changes,
  }));
}

// Definiciones (JSON Schema) enviadas a Anthropic — "tools" varía según
// permisos del rol (ver canSeePresupuesto/canSeeAuditoria en chat/route.js):
// las herramientas de presupuesto/auditoría ni siquiera se le ofrecen al
// modelo si el rol no tiene ese permiso, en vez de ofrecerlas y rechazarlas
// después — así nunca "sabe" que existen si no puede usarlas.
export function buildToolDefs({ canSeePresupuesto, canSeeAuditoria, canSeeProveedoresGestion, canSeeBienestar, canSeeTesoreria = false }) {
  const tools = [
    CONSULTAR_REFERENCIA_TOOL,
    {
      name: "resumen_compras",
      description: "Cifras EXACTAS (sumas, conteos, promedios, porcentajes) calculadas sobre el 100% de los registros de compra que cumplan los filtros dados — totales por área/categoría/estado/proveedor, cumplimiento de tiempos de entrega, % de legalización, etc. Úsala SIEMPRE para cualquier pregunta de totales, promedios, distribución o \"análisis general\" — nunca sumes o calcules estos números tú mismo a partir de buscar_registros (esa es solo para citar ejemplos puntuales, no para agregados). Para comparar dos periodos (ej. \"2025 vs 2026\", \"este trimestre vs el anterior\"), llama esta misma herramienta UNA VEZ POR CADA periodo (con 'anio', o con 'fechaDesde'/'fechaHasta' si el periodo no es un año calendario completo) y compara tú los totales ya exactos que te devuelva cada llamada — no hace falta (ni debes) sumar registros individuales para esto.",
      input_schema: {
        type: "object",
        properties: {
          area: { type: "string", description: "Filtra solo por esta área (opcional, nombre exacto tal como aparece en los datos)." },
          anio: { type: "integer", description: "Filtra solo por año de la fecha de solicitud (opcional, ej. 2026). Se ignora si se envían fechaDesde/fechaHasta." },
          incluirSinIva: { type: "boolean", description: "true SOLO si el usuario pregunta expresamente por el valor sin IVA o antes de IVA. Por defecto se devuelven solo los valores totales (con IVA)." },
          fechaDesde: { type: "string", description: "Fecha mínima de solicitud, formato YYYY-MM-DD (opcional) — úsala en vez de 'anio' para periodos que no son un año completo (trimestres, meses, rangos arbitrarios)." },
          fechaHasta: { type: "string", description: "Fecha máxima de solicitud, formato YYYY-MM-DD (opcional)." },
          categoria: { type: "string", description: "Filtra solo por esta categoría (opcional). Si no es el nombre exacto, se toman las categorías que contengan todas sus palabras; la respuesta lo explica en notaFiltros." },
          proveedor: { type: "string", description: "Filtra solo por este proveedor (opcional, coincidencia parcial, sin distinguir mayúsculas/minúsculas)." },
        },
      },
    },
    {
      name: "buscar_registros",
      description: "Busca registros de compra INDIVIDUALES que cumplan filtros específicos, para citar ejemplos puntuales (proveedor, descripción, montos, fechas) — NO la uses para calcular totales o porcentajes generales (para eso usa resumen_compras). Devuelve como máximo 'limit' registros (por defecto 20, máximo 50) ordenados del más reciente al más antiguo, más el total de coincidencias reales (que puede ser mayor a lo devuelto).",
      input_schema: {
        type: "object",
        properties: {
          area: { type: "string", description: "Nombre exacto del área (opcional)." },
          estado: { type: "string", description: "Nombre exacto del estado de la compra (opcional)." },
          categoria: { type: "string", description: "Categoría (opcional; nombre exacto o sus palabras principales, p. ej. 'imprevistos administrativos')." },
          proveedor: { type: "string", description: "Coincidencia parcial del nombre del proveedor (opcional)." },
          descripcion: { type: "string", description: "Coincidencia parcial de la descripción de la compra (opcional, ej. \"empanada\", \"tiquete\")." },
          medioPago: { type: "string", description: "Nombre exacto del medio de pago (opcional)." },
          estadoLegalizacion: { type: "string", description: "Nombre exacto del estado de legalización (opcional)." },
          fechaDesde: { type: "string", description: "Fecha mínima de solicitud, formato YYYY-MM-DD (opcional)." },
          fechaHasta: { type: "string", description: "Fecha máxima de solicitud, formato YYYY-MM-DD (opcional)." },
          valorMin: { type: "number", description: "Valor con IVA mínimo en pesos colombianos (opcional)." },
          valorMax: { type: "number", description: "Valor con IVA máximo en pesos colombianos (opcional)." },
          limit: { type: "integer", description: "Máximo de registros a devolver (opcional, por defecto 20, máximo 50)." },
        },
      },
    },
    {
      name: "sugerir_proveedores_por_articulo",
      description: "Busca en el HISTORIAL de compras qué proveedores ya han vendido algo similar a una descripción dada (ej. \"empanadas\", \"resmas de papel\", \"tiquetes aéreos\") y los sugiere ordenados por cuántas veces se les ha comprado y qué tan reciente fue la última compra — úsala para responder \"¿a quién le puedo comprar X?\" o \"dame ideas de proveedores para Y\". Incluye teléfono/correo del proveedor cuando está registrado en el catálogo de Proveedores (Maestros). Si no hay coincidencias, dilo así — nunca inventes un proveedor que no haya salido en esta herramienta o en buscar_registros.",
      input_schema: {
        type: "object",
        required: ["descripcion"],
        properties: {
          descripcion: { type: "string", description: "Texto a buscar en la descripción de la compra (coincidencia parcial, ej. \"empanada\")." },
          categoria: { type: "string", description: "Filtra además por esta categoría (opcional; nombre exacto o sus palabras principales)." },
          area: { type: "string", description: "Filtra además por esta área exacta (opcional)." },
          limit: { type: "integer", description: "Máximo de proveedores distintos a devolver (opcional, por defecto 8, máximo 20)." },
        },
      },
    },
    {
      name: "datos_proveedor",
      description: "Busca en el catálogo de Proveedores por nombre, NIT o descripción y devuelve su ficha: NIT (llave del proveedor), nombre, descripción, contacto (teléfono/correo), tipo (criticidad), clasificación por monto, área, tipo de servicio, si es excepción, si está activo, fecha de registro y de última actualización. Úsala para preguntas sobre UN proveedor puntual (contacto, a qué se dedica, cómo está clasificado). Si no aparece, dilo así — puede que exista en el historial de compras pero no esté en el catálogo.",
      input_schema: {
        type: "object",
        required: ["busqueda"],
        properties: {
          busqueda: { type: "string", description: "Nombre (parcial), NIT o palabra de la descripción del proveedor." },
        },
      },
    },
    {
      name: "mis_pendientes",
      description: "Lo que le toca hacer HOY a la persona que te escribe, según su rol (es lo mismo que ve en la pantalla \"Mi día y alertas\"): compras por legalizar o por radicar, legalizaciones rechazadas, solicitudes atrasadas, proveedores desactualizados o estancados, checklist incompleto, presupuesto en riesgo y compras mal valoradas (según el rol). Devuelve por sección el total, cuántos son urgentes y los primeros ítems con su referencia (#123 o NIT), días y detalle. Úsala para preguntas como \"¿qué me toca hoy?\", \"¿qué tengo pendiente?\", \"¿por dónde empiezo?\", \"¿qué está urgente?\". Cada rol solo ve sus propios pendientes. Si no hay nada, dilo: está todo al día.",
      input_schema: { type: "object", properties: { limite: { type: "integer", description: "Máximo de ítems por sección (opcional, por defecto 8, máximo 20)." } } },
    },
    {
      name: "consultar_valoraciones",
      description: "Consulta las valoraciones de Nova GUARDADAS de las compras radicadas: puntaje de la compra y del proveedor (1 a 5), el resumen, por qué se calificó así (observación de la compra y del proveedor) y los factores considerados. Úsala para preguntas como \"¿por qué la compra #339 tiene 1?\", \"¿cómo califica la IA a COMPENSAR y por qué?\", \"¿cuáles son las compras peor valoradas?\", \"proveedores con calificación baja\" o \"¿qué compras tienen puntaje de proveedor menor a 3?\". Con un registro o un proveedor concreto devuelve el detalle completo; sin filtros devuelve las compras peor valoradas y los promedios. Los criterios con los que se califica NO salen de esta herramienta: están en la guía de la aplicación (sección 9). Si una compra no tiene valoración, dilo (puede que aún no esté radicada o no se haya valorado).",
      input_schema: {
        type: "object",
        properties: {
          registro: { type: "string", description: "Número de la compra (el # de la tabla de Registros), ej. \"339\" o \"#339\" (opcional)." },
          proveedor: { type: "string", description: "Nombre (parcial) o NIT del proveedor (opcional)." },
          puntajeCompraMaximo: { type: "integer", description: "Solo valoraciones cuyo puntaje de la compra sea menor o igual a este (1 a 5) (opcional)." },
          puntajeProveedorMaximo: { type: "integer", description: "Solo valoraciones cuyo puntaje del proveedor sea menor o igual a este (1 a 5) (opcional)." },
          orden: { type: "string", description: "\"peores\" (por defecto) o \"mejores\" — orden por puntaje de la compra (opcional)." },
          limit: { type: "integer", description: "Máximo de valoraciones a devolver (opcional, por defecto 8, máximo 25). Con 3 o menos se incluye el detalle completo (observaciones y factores)." },
        },
      },
    },
  ];

  if (canSeeProveedoresGestion) {
    tools.push({
      name: "estado_gestion_proveedor",
      description: "Ficha COMPLETA de gestión de un proveedor (módulo Proveedores): NIT, tipo (criticidad), clasificación por monto, área, tipo de servicio, excepción y su motivo, activo/inactivo, fecha de registro y de última actualización (base del ciclo), clasificación en el ciclo vigente (Actualización, Nuevo, Excepción, Inactivo, Por registrar), estado del ciclo (Desactualizado, En proceso, En aprobación, Actualizado), checklist de 6 documentos y qué le falta, alerta que ve Compras e histórico de ciclos. Úsala cuando pregunten por un proveedor puntual: si está actualizado, qué le falta, cómo está clasificado, desde cuándo, etc.",
      input_schema: {
        type: "object",
        required: ["busqueda"],
        properties: {
          busqueda: { type: "string", description: "Nombre (parcial) o NIT del proveedor." },
        },
      },
    });
    tools.push({
      name: "resumen_ciclo_proveedores",
      description: "Resumen EXACTO del ciclo de actualización de proveedores: total y avance (% actualizado), conteos por clasificación (Actualización, Nuevo, Excepción, Inactivo, Por registrar) y por estado del ciclo, criticidad, avance por área, críticos pendientes, checklist incompleto, actualizaciones por mes, compras hechas con proveedores en alerta y cuántos quedarán desactualizados el próximo ciclo. Úsala para el panorama general del ciclo. Para conteos por otros campos (tipo de servicio, clasificación por monto, motivo de excepción…) usa buscar_proveedores_gestion con agruparPor.",
      input_schema: { type: "object", properties: {} },
    });
    tools.push({
      name: "buscar_proveedores_gestion",
      description: "Consulta el maestro de proveedores con CUALQUIER combinación de campos y devuelve el conteo exacto, una agrupación opcional y el detalle de los primeros. Sirve para preguntas como: \"¿cuántos proveedores críticos siguen desactualizados?\", \"proveedores de tipo de servicio Ferias\", \"¿cuántos proveedores hay por clasificación por monto?\", \"excepciones por motivo\", \"proveedores del área Mercadeo que son excepción\", \"¿quiénes se actualizaron en septiembre?\", \"proveedores registrados este año\", \"proveedores sin fecha de actualización\", \"inactivos y su motivo\". Todos los filtros de texto son parciales y sin distinguir tildes ni mayúsculas. Cada proveedor trae: NIT, nombre, descripción, tipo (criticidad), clasificación por monto, área, tipo de servicio, excepción y motivo, activo, clasificación y estado en el ciclo, fecha de última actualización, fecha de registro, contacto, checklist y alerta.",
      input_schema: {
        type: "object",
        properties: {
          texto: { type: "string", description: "Busca en nombre, NIT, descripción u observación (opcional)." },
          clasificacion: { type: "string", description: "Clasificación en el ciclo: \"actualizacion\" | \"nuevo\" | \"excepcion\" | \"inactivo\" | \"por_registrar\" (opcional)." },
          estado: { type: "string", description: "Estado del ciclo: \"desactualizado\" | \"en_proceso\" | \"en_aprobacion\" | \"actualizado\" (opcional, solo aplica a Actualización y Nuevo)." },
          criticidad: { type: "string", description: "Tipo (criticidad): \"Crítico\" | \"No crítico\" | \"sin_definir\" (opcional)." },
          clasificacionMonto: { type: "string", description: "Clasificación por monto, texto parcial (ej. \"bajo impacto\", \"alto costo\", \"grandes contribuyentes\", \"internacional\") (opcional)." },
          tipoServicio: { type: "string", description: "Tipo de servicio, texto parcial (ej. \"ferias\", \"transporte\", \"licencias\") (opcional)." },
          area: { type: "string", description: "Área del proveedor, texto parcial (ej. \"mercadeo\") (opcional). Es el área de Proveedores, distinta del área de Compras." },
          excepcion: { type: "boolean", description: "true = solo excepciones; false = solo las que no son excepción (opcional)." },
          motivoExcepcion: { type: "string", description: "Motivo de excepción, texto parcial (ej. \"gran contribuyente\", \"compra ocasional\") (opcional)." },
          activo: { type: "boolean", description: "true = solo activos; false = solo inactivos (opcional)." },
          checklist: { type: "string", description: "\"completo\" | \"incompleto\" (opcional)." },
          actualizadoDesde: { type: "string", description: "Fecha de última actualización desde, YYYY-MM-DD (opcional)." },
          actualizadoHasta: { type: "string", description: "Fecha de última actualización hasta, YYYY-MM-DD (opcional)." },
          sinFechaActualizacion: { type: "boolean", description: "true = solo los que no tienen fecha de última actualización (opcional)." },
          registradoDesde: { type: "string", description: "Fecha de registro desde, YYYY-MM-DD (opcional)." },
          registradoHasta: { type: "string", description: "Fecha de registro hasta, YYYY-MM-DD (opcional)." },
          agruparPor: { type: "string", enum: Object.keys(AGRUPACIONES_PROVEEDOR), description: "Agrupa los resultados y cuenta cuántos hay en cada grupo (opcional). Úsalo para \"¿cuántos hay por…?\"." },
          limit: { type: "integer", description: "Máximo de proveedores a listar en detalle (opcional, por defecto 15, máximo 50) — el conteo y la agrupación siempre son sobre el 100%." },
        },
      },
    });
  }

  if (canSeePresupuesto) {
    tools.push({
      name: "resumen_presupuesto",
      description: "Presupuesto de COMPRAS configurado por área y año (total, o desglosado por categoría) y cuánto lleva gastado cada área, con totales por año ya calculados. NO es el presupuesto de las actividades de Bienestar o Fundación: para el costo de un plan de actividades o el presupuesto asignado a cada actividad usa resumen_bienestar.",
      input_schema: {
        type: "object",
        properties: {
          area: { type: "string", description: "Filtra solo por esta área (opcional, nombre exacto)." },
          anio: { type: "integer", description: "Filtra solo por este año (opcional, ej. 2026)." },
        },
      },
    });
  }

  // Tesorería: solo con acceso nominal (lo decide el chat). El MCP nunca lo pasa, así que ahí no existen.
  if (canSeeTesoreria) tools.push(...TOOLS_TESORERIA);
  if (canSeeBienestar) {
    const LINEA = { type: "string", enum: ["Bienestar", "Fundación"], description: "Línea: Bienestar (actividades de los colaboradores) o Fundación (acompañamiento a la Fundación)." };
    tools.push(
      {
        name: "resumen_bienestar",
        description: "Presupuesto asignado a las actividades del año (el costo del plan, también de años futuros: cifras.presupuestoDeActividades) y Cifras de una línea en un año (o un mes): actividades por estado, asistentes y porcentaje de asistencia, gasto en compras ASOCIADAS a actividades frente al presupuesto, costo por asistente, gasto por mes y categoría, participación por área, motivos de inasistencia y próximas actividades. Úsala para totales, comparaciones y gráficos de Bienestar o Fundación.",
        input_schema: { type: "object", properties: { linea: LINEA, anio: { type: "integer", description: "Año (opcional, por defecto el actual)." }, mes: { type: "integer", description: "Mes de 1 a 12 (opcional; sin mes, el año completo)." }, compararCon: { type: "integer", description: "Otro año para comparar (opcional): devuelve las dos cifras y las diferencias ya calculadas." } }, required: ["linea"] },
      },
      {
        name: "buscar_actividades",
        description: "Lista actividades de Bienestar o Fundación con su fecha, estado, responsable, presupuesto, gasto, inscritos, asistentes y calificaciones, con los conteos por línea y estado ya calculados. Filtra por línea, año, estado, rango de fechas o texto del nombre. Para \"qué actividades se han realizado / hecho a la fecha\" usa realizadas: true (ejecutadas o cerradas con fecha hasta hoy).",
        input_schema: { type: "object", properties: { linea: LINEA, anio: { type: "integer", description: "Año (opcional)." }, estado: { type: "string", enum: ["creada", "programada", "ejecutada", "cerrada"], description: "Estado (opcional)." }, realizadas: { type: "boolean", description: "Solo las ya realizadas: ejecutadas o cerradas con fecha hasta hoy (opcional)." }, desde: { type: "string", description: "Fecha mínima AAAA-MM-DD (opcional)." }, hasta: { type: "string", description: "Fecha máxima AAAA-MM-DD (opcional)." }, texto: { type: "string", description: "Parte del nombre (opcional)." }, limite: { type: "integer", description: "Máximo de filas (opcional, por defecto 30, máximo 60)." } } },
      },
      {
        name: "detalle_actividad",
        description: "Detalle de UNA actividad: fechas, presupuesto y gasto, sus compras, participación por área y motivos de inasistencia, inventario y lo que sobró, calificación al cerrar y el análisis de Nova. No trae nombres ni datos de personas.",
        input_schema: { type: "object", properties: { id: { type: "integer", description: "Id de la actividad (opcional si das el nombre)." }, nombre: { type: "string", description: "Nombre o parte del nombre (opcional si das el id)." } } },
      },
      {
        name: "fotos_actividad",
        description: "Material fotográfico (fotos) de UNA actividad de Bienestar o Fundación: cuántas hay, su descripción y el bloque que debes poner en tu respuesta para que el usuario las vea en el chat.",
        input_schema: { type: "object", properties: { id: { type: "integer", description: "Id de la actividad (opcional si das el nombre)." }, nombre: { type: "string", description: "Nombre o parte del nombre (opcional si das el id)." } } },
      }
    );
  }

  if (canSeeAuditoria) {
    tools.push({
      name: "registro_auditoria",
      description: "Historial de auditoría (quién hizo qué, cuándo, sobre qué, y qué campos cambiaron) para registros de compra, maestros, usuarios, presupuestos o permisos.",
      input_schema: {
        type: "object",
        properties: {
          usuario: { type: "string", description: "Filtra por nombre o correo del usuario que hizo la acción (opcional, coincidencia parcial)." },
          entidad: { type: "string", description: "Filtra por tipo de entidad afectada, ej. \"record\", \"user\", \"presupuesto\" (opcional, coincidencia parcial)." },
          desde: { type: "string", description: "Fecha mínima, formato YYYY-MM-DD (opcional)." },
          hasta: { type: "string", description: "Fecha máxima, formato YYYY-MM-DD (opcional)." },
          limit: { type: "integer", description: "Máximo de movimientos a devolver (opcional, por defecto 30, máximo 80)." },
        },
      },
    });
  }

  return tools;
}

// Fábrica del ejecutor: "records"/"presupuestos" se cargan como mucho una vez
// por request de chat (memoizados aquí), sin importar cuántas veces el modelo
// llame a una herramienta que los necesite en la misma conversación-turno.
// Bienestar y Fundación tienen permisos separados: cada consulta valida el de su línea. A Nova solo le llegan cifras
// agregadas: ni nombres de participantes ni los datos sensibles de los formularios.
const puedeLinea = (user, linea, tipo = "lista") => {
  const fundacion = linea === "Fundación";
  const feature = tipo === "dashboard" ? (fundacion ? "viewDashboardFundacion" : "viewDashboardBienestar") : (fundacion ? "viewFundacion" : "viewBienestar");
  return user ? isRoleAllowed(user.role, feature) : false;
};
const filaActividad = (a) => ({
  id: a.id, nombre: a.nombre, linea: a.linea, fecha: a.fecha, fechaFin: a.fechaFin, estado: a.estado, responsable: a.responsableNombre,
  // Sin compras asociadas el gasto no es $0 sino que no hay dato (las compras pueden estar sin asociar).
  presupuesto: a.presupuesto, gastadoEnComprasAsociadas: a.compras ? a.gastado : null, compras: a.compras, inscritos: a.inscritos, asistentes: a.asistentes,
  aplicaParticipantes: a.aplicaParticipantes, calificacionAlCerrar: a.calificacion, puntajeNova: a.puntajeNova,
});

// Encuentra la actividad por id o por parte del nombre (sin tildes ni mayúsculas). Si hay varias, devuelve la lista
// para que Nova pregunte cuál es; si el nombre coincide exacto con una, se queda con esa.
async function actividadPorIdONombre(args) {
  const id = Number(args.id) || null;
  if (id) return { id };
  const q = String(args.nombre || "").trim();
  if (!q) return { respuesta: { error: "Indica el id o el nombre de la actividad." } };
  const sin = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const filas = await prisma.actividadBienestar.findMany({ select: { id: true, nombre: true, fecha: true, linea: true }, orderBy: { fecha: "desc" } });
  const hallada = filas.filter((a) => sin(a.nombre).includes(sin(q)));
  if (!hallada.length) return { respuesta: { error: "No encontré una actividad con ese nombre. Usa buscar_actividades para ver los nombres." } };
  const exacta = hallada.filter((a) => sin(a.nombre) === sin(q));
  if (exacta.length === 1) return { id: exacta[0].id };
  if (hallada.length > 1) return { respuesta: { varias: hallada.slice(0, 8), nota: "Hay varias con ese nombre: pregunta cuál es (muestra nombre y fecha)." } };
  return { id: hallada[0].id };
}

export function buildToolExecutor({ canSeePresupuesto, canSeeAuditoria, canSeeProveedoresGestion, user }) {
  let recordsPromise = null;
  const getRecords = () => (recordsPromise ??= listRecords());

  let presupuestosPromise = null;
  const getPresupuestos = () => (presupuestosPromise ??= listPresupuestos().then((r) => r.presupuestos));

  return async function executeTool(name, input) {
    const args = input || {};
    if (NOMBRES_TESORERIA.has(name)) return ejecutarTesoreria(name, args, user);
    switch (name) {
      case "consultar_referencia":
        return consultarReferencia(args || {});
      case "resumen_compras": {
        const records = await getRecords();
        // fechaDesde/fechaHasta explícitos tienen prioridad sobre "anio" —
        // permite comparar periodos que no son un año calendario completo
        // (trimestres, meses, rangos arbitrarios), no solo año contra año.
        const { filtros, notas } = resolverFiltros(records, {
          area: args.area, categoria: args.categoria, proveedor: args.proveedor,
          fechaDesde: args.fechaDesde || (args.anio ? `${args.anio}-01-01` : undefined),
          fechaHasta: args.fechaHasta || (args.anio ? `${args.anio}-12-31` : undefined),
        });
        const filtered = records.filter((r) => matchesFilters(r, filtros));
        const presupuestos = canSeePresupuesto ? await getPresupuestos() : [];
        const aggregates = buildAggregates(filtered, presupuestos);
        if (!canSeePresupuesto) delete aggregates.presupuesto;
        // Por defecto solo los valores totales (con IVA): el valor sin IVA falta en muchas compras y confundía al
        // mostrarlo junto al total. Solo se entrega si el usuario lo pide expresamente.
        if (!args.incluirSinIva) { delete aggregates.totalValorSinIva; delete aggregates.comprasConValorSinIva; delete aggregates.valorConIvaDeEsasCompras; }
        return notas.length ? { notaFiltros: notas, ...aggregates } : aggregates;
      }
      case "buscar_registros": {
        const records = await getRecords();
        const limit = Math.max(1, Math.min(MAX_BUSCAR_LIMIT, Number(args.limit) || DEFAULT_BUSCAR_LIMIT));
        const { filtros, notas } = resolverFiltros(records, args);
        const matches = records.filter((r) => matchesFilters(r, filtros));
        const ordenados = [...matches].reverse(); // listRecords ya viene asc por fechaSolicitud
        return {
          ...(notas.length ? { notaFiltros: notas } : {}),
          totalCoincidencias: matches.length,
          registrosDevueltos: Math.min(limit, ordenados.length),
          registros: ordenados.slice(0, limit).map(compactRecordForChat),
        };
      }
      case "sugerir_proveedores_por_articulo": {
        const records = await getRecords();
        const limit = Math.max(1, Math.min(20, Number(args.limit) || 8));
        const { filtros, notas } = resolverFiltros(records, { descripcion: args.descripcion, categoria: args.categoria, area: args.area });
        const matches = records.filter((r) => matchesFilters(r, filtros));
        if (matches.length === 0) {
          return { encontrados: 0, proveedores: [], nota: ["No hay compras previas que coincidan con esa descripción.", ...notas].join(" ") };
        }
        // Agrupa por proveedorNit cuando existe (referencia real al
        // catálogo); si el registro es viejo y no quedó atado a ninguno,
        // agrupa por nombre normalizado (mejor esfuerzo).
        const groups = new Map();
        for (const r of matches) {
          if (!r.proveedor) continue;
          const key = r.proveedorNit ? `nit:${r.proveedorNit}` : `nombre:${norm(r.proveedor)}`;
          const g = groups.get(key) || { nombre: r.proveedor, proveedorNit: r.proveedorNit || null, veces: 0, ultimaFecha: null, ultimoValor: null };
          g.veces += 1;
          if (!g.ultimaFecha || (r.fechaSolicitud && r.fechaSolicitud > g.ultimaFecha)) {
            g.ultimaFecha = r.fechaSolicitud;
            g.ultimoValor = r.valorConIva;
            g.nombre = r.proveedor;
          }
          groups.set(key, g);
        }
        const ordenados = Array.from(groups.values())
          .sort((a, b) => b.veces - a.veces || (b.ultimaFecha || "").localeCompare(a.ultimaFecha || ""));
        const top = ordenados.slice(0, limit);
        const nitsProveedor = top.filter((p) => p.proveedorNit).map((p) => p.proveedorNit);
        const catalogo = nitsProveedor.length ? await prisma.proveedor.findMany({ where: { nit: { in: nitsProveedor } } }) : [];
        const catalogoPorNit = new Map(catalogo.map((c) => [c.nit, c]));
        return {
          encontrados: ordenados.length,
          proveedores: top.map((p) => {
            const c = p.proveedorNit ? catalogoPorNit.get(p.proveedorNit) : null;
            return {
              nombre: p.nombre,
              nit: c?.nit || null,
              vecesComprado: p.veces,
              ultimaCompra: p.ultimaFecha,
              ultimoValorConIva: p.ultimoValor,
              telefono: c?.telefono || null,
              correo: c?.correo || null,
              enCatalogoProveedores: !!c,
            };
          }),
        };
      }
      case "datos_proveedor": {
        const q = normTxt(args.busqueda);
        const qNit = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const all = await prisma.proveedor.findMany({ orderBy: { nombre: "asc" } });
        const matches = all.filter((p) => normTxt(p.nombre).includes(q) || (qNit && p.nit.includes(qNit)) || normTxt(p.descripcion).includes(q));
        return {
          encontrados: matches.length,
          proveedores: matches.slice(0, 10).map((p) => ({
            nit: p.nit, nombre: p.nombre, descripcion: p.descripcion,
            telefono: p.telefono || null, correo: p.correo || null,
            tipoCriticidad: p.criticidad || "Sin definir", clasificacionPorMonto: p.clasificacionMonto || null,
            area: p.area || null, tipoServicio: p.servicio || null,
            excepcion: p.esExcepcion, activo: p.activo,
            fechaRegistro: fechaISO(p.createdAt), fechaUltimaActualizacion: p.esExcepcion ? "No aplica (excepción)" : fechaISO(p.fechaActualizacion),
          })),
        };
      }
      case "mis_pendientes": {
        if (!user) return { error: "No se pudo identificar al usuario." };
        const maxItems = Math.max(1, Math.min(20, Number(args.limite) || 8));
        return getPendientesParaNova(user, maxItems);
      }
      case "consultar_valoraciones": {
        const limit = Math.max(1, Math.min(25, Number(args.limit) || 8));
        const recordWhere = {};
        if (args.registro) {
          const n = Number(String(args.registro).replace(/\D/g, ""));
          if (!n) return { error: "El número de registro no es válido." };
          recordWhere.localSeq = n;
        }
        if (args.proveedor) {
          const txt = String(args.proveedor).trim();
          const nitTxt = txt.toUpperCase().replace(/[^A-Z0-9]/g, "");
          const provs = await prisma.proveedor.findMany({
            where: { OR: [{ nombre: { contains: txt, mode: "insensitive" } }, ...(nitTxt ? [{ nit: { contains: nitTxt } }] : [])] },
            select: { nit: true, nombre: true },
            take: 20,
          });
          if (!provs.length) return { encontrados: 0, nota: "No hay ningún proveedor con ese nombre/NIT en el catálogo." };
          recordWhere.proveedorNit = { in: provs.map((p) => p.nit) };
        }
        const where = { record: recordWhere };
        if (Number.isInteger(args.puntajeCompraMaximo)) where.puntajeCompra = { lte: args.puntajeCompraMaximo };
        if (Number.isInteger(args.puntajeProveedorMaximo)) where.puntajeProveedor = { lte: args.puntajeProveedorMaximo };

        const mejores = norm(args.orden) === "mejores";
        const [total, promedios, filas] = await Promise.all([
          prisma.valoracionCompra.count({ where }),
          prisma.valoracionCompra.aggregate({ where, _avg: { puntajeCompra: true, puntajeProveedor: true } }),
          prisma.valoracionCompra.findMany({
            where,
            orderBy: [{ puntajeCompra: mejores ? "desc" : "asc" }, { id: "asc" }],
            take: limit,
            include: { record: { select: { localSeq: true, fechaSolicitud: true, descripcion: true, proveedor: true, proveedorNit: true, estado: true } } },
          }),
        ]);
        if (!total) return { encontradas: 0, nota: "No hay valoraciones de Nova para ese filtro (la compra puede no estar radicada todavía o no haberse valorado)." };
        const detallada = filas.length <= 3;
        const redondeo = (x) => (x == null ? null : Math.round(x * 10) / 10);
        return {
          valoracionesEncontradas: total,
          promedioPuntajeCompra: redondeo(promedios._avg.puntajeCompra),
          promedioPuntajeProveedor: redondeo(promedios._avg.puntajeProveedor),
          valoracionesDevueltas: filas.length,
          valoraciones: filas.map((v) => {
            let factores = [];
            try { factores = v.factores ? JSON.parse(v.factores) : []; } catch { factores = []; }
            return {
              compra: `#${v.record.localSeq}`,
              fechaSolicitud: v.record.fechaSolicitud,
              descripcion: v.record.descripcion,
              estado: v.record.estado,
              proveedor: v.record.proveedor,
              nitProveedor: v.record.proveedorNit,
              puntajeCompra: v.puntajeCompra,
              puntajeProveedor: v.puntajeProveedor,
              resumen: v.resumen,
              comprasAnterioresAnalizadas: v.comprasPrevias,
              ...(detallada ? { porQueCalificoLaCompra: v.observacionCompra, porQueCalificoAlProveedor: v.observacionProveedor, factores } : {}),
            };
          }),
          nota: detallada ? undefined : "Para ver por qué se calificó una compra o un proveedor concreto, vuelve a llamar a la herramienta con el número de registro o el proveedor.",
        };
      }
      case "estado_gestion_proveedor": {
        if (!canSeeProveedoresGestion) return { error: "No autorizado para consultar Gestión de Proveedores." };
        const busqueda = String(args.busqueda || "").trim();
        const qNit = busqueda.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const candidatos = await prisma.proveedor.findMany({
          where: { OR: [{ nombre: { contains: busqueda, mode: "insensitive" } }, ...(qNit ? [{ nit: { contains: qNit } }] : [])] },
          select: { nit: true, nombre: true },
          take: 10,
        });
        if (!candidatos.length) return { encontrado: false, nota: "No hay ningún proveedor con ese nombre/NIT en el catálogo." };
        // El NIT es la llave primaria del proveedor.
        const exacto = candidatos.find((c) => c.nit === qNit) || candidatos[0];
        const d = await getProveedorDetalle(exacto.nit);
        return {
          encontrado: true,
          otrasCoincidencias: candidatos.filter((c) => c.nit !== exacto.nit).map((c) => `${c.nombre} (NIT ${c.nit})`),
          anioCiclo: d.anio,
          ...proveedorParaChat(d),
          historial: d.historial.map((h) => ({ anio: h.anio, clasificacion: h.clasificacionLabel, estado: h.estadoLabel })),
        };
      }
      case "resumen_ciclo_proveedores": {
        if (!canSeeProveedoresGestion) return { error: "No autorizado para consultar Gestión de Proveedores." };
        const r = await indicadoresCiclo();
        return {
          cicloAnio: r.anio, diasParaElCorte: r.diasParaCorte, totalProveedores: r.total, proveedoresEnElCiclo: r.enCiclo,
          porcentajeActualizado: r.pctActualizado, clasificacion: r.clasificacion, estadosDelCiclo: r.estados,
          criticidad: r.criticidad, checklistIncompleto: r.checklistIncompleto, criticos: r.criticos,
          criticosPendientes: r.atencion, avancePorArea: r.areas,
          actualizadosPorMes: r.porMes.map((m) => ({ mes: m.label, actualizados: m.value })),
          comprasConProveedorEnAlerta: r.comprasConAlerta,
          cicloSiguiente: { anio: r.proximoCiclo.anio, quedaranDesactualizados: r.proximoCiclo.desactualizados },
        };
      }
      case "buscar_proveedores_gestion": {
        if (!canSeeProveedoresGestion) return { error: "No autorizado para consultar Gestión de Proveedores." };
        const limit = Math.max(1, Math.min(50, Number(args.limit) || 15));
        const data = await listMaestroProveedores({
          clasificacion: args.clasificacion,
          estado: args.estado,
          criticidad: args.criticidad,
          checklist: args.checklist,
          excepcion: args.excepcion === true ? "si" : args.excepcion === false ? "no" : "",
        });
        const rows = data.rows.filter((p) =>
          contiene(`${p.nombre} ${p.nit} ${p.descripcion || ""} ${p.observacion || ""}`, args.texto)
          && contiene(p.area, args.area)
          && contiene(p.servicio, args.tipoServicio)
          && contiene(p.clasificacionMonto, args.clasificacionMonto)
          && (!args.motivoExcepcion || (p.esExcepcion && contiene(p.motivoExcepcion, args.motivoExcepcion)))
          && (typeof args.activo !== "boolean" || p.activo === args.activo)
          && enRango(p.fechaActualizacion, args.actualizadoDesde, args.actualizadoHasta)
          && (!args.sinFechaActualizacion || !p.fechaActualizacion)
          && enRango(p.createdAt, args.registradoDesde, args.registradoHasta));

        let agrupado = null;
        const agrupar = AGRUPACIONES_PROVEEDOR[args.agruparPor];
        if (agrupar) {
          const conteo = new Map();
          for (const p of rows) {
            const k = agrupar(p);
            conteo.set(k, (conteo.get(k) || 0) + 1);
          }
          agrupado = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([grupo, cantidad]) => ({ grupo, cantidad }));
        }
        return {
          anioCiclo: data.anio,
          totalEnElMaestro: data.total,
          totalCoincidencias: rows.length,
          ...(agrupado ? { agrupadoPor: args.agruparPor, grupos: agrupado } : {}),
          proveedoresDevueltos: Math.min(limit, rows.length),
          proveedores: rows.slice(0, limit).map(proveedorParaChat),
          nota: rows.length > limit ? `Solo se detallan ${limit} de ${rows.length}; los conteos son sobre el total.` : undefined,
        };
      }
      case "resumen_presupuesto": {
        if (!canSeePresupuesto) return { error: "No autorizado para consultar presupuesto." };
        const [records, presupuestos] = await Promise.all([getRecords(), getPresupuestos()]);
        return buildPresupuestoResumen(records, presupuestos, args);
      }
      case "resumen_bienestar": {
        const linea = args.linea === "Fundación" ? "Fundación" : "Bienestar";
        if (!(await puedeLinea(user, linea, "dashboard"))) return { error: `No autorizado para consultar el resumen de ${linea}.` };
        const r = await resumenBienestar(args.anio || new Date().getFullYear(), linea, args.mes || null);
        const cifras = (x) => ({
          anio: x.anio, actividades: x.kpis.actividades, ejecutadasOCerradas: (x.kpis.porEstado.ejecutada || 0) + (x.kpis.porEstado.cerrada || 0),
          // Sin ninguna actividad con lista de asistencia el número de asistentes no existe (no es 0).
          asistentes: x.participacion.registrados || x.kpis.asistentes ? x.kpis.asistentes : null, inscritosConLista: x.participacion.inscritos, asistencia: x.kpis.asistencia,
          presupuestoDeActividades: x.kpis.presupuestoAsignado, gastoAsociadoAActividades: x.kpis.gastoArea, costoPorAsistente: x.kpis.costoPorAsistente,
          comprasDelAreaSinActividad: x.comprasSinActividad,
        });
        let comparacion;
        if (args.compararCon && Number(args.compararCon) !== r.anio) {
          const otro = cifras(await resumenBienestar(args.compararCon, linea, args.mes || null));
          const actual = cifras(r);
          const dif = (k) => (actual[k] == null || otro[k] == null ? "sin dato" : actual[k] - otro[k]);
          comparacion = { [r.anio]: actual, [otro.anio]: otro, diferencias: { asistentes: dif("asistentes"), gastoAsociadoAActividades: dif("gastoAsociadoAActividades"), presupuestoDeActividades: dif("presupuestoDeActividades"), actividades: dif("actividades") } };
        }
        return {
          nota: "Todo gasto del módulo es de compras ASOCIADAS a una actividad, en el mes de la actividad. Las compras del área Bienestar sin actividad van aparte en comprasDelAreaSinActividad: menciónalas cuando hables de cuánto se gasta. presupuestoDeActividades es lo asignado a cada actividad (distinto del presupuesto de Compras por área). Usa las cifras tal cual vienen; si algo es null o falta, di 'sin dato'.",
          cifras: cifras(r),
          ...(comparacion ? { comparacion } : {}),
          linea, anio: r.anio, mes: r.mes, kpis: r.kpis,
          porMes: r.mes ? undefined : r.porMes.map((m) => ({ mes: m.mes, actividades: m.actividades, asistentes: m.asistentes, gasto: m.gastoArea })),
          actividades: r.porActividad.slice(0, 30),
          categorias: r.categorias.slice(0, 10),
          participacion: { ...r.participacion, porArea: r.participacion.porArea.slice(0, 15), motivos: r.participacion.motivos.slice(0, 8) },
          presupuestoVsGasto: r.presupuestoVsGasto.slice(0, 15),
          costoPorActividad: r.costoPorActividad.slice(0, 15),
          proximas: r.proximas.map(filaActividad),
        };
      }
      case "fotos_actividad": {
        const hallada = await actividadPorIdONombre(args);
        if (hallada.respuesta) return hallada.respuesta;
        const a = await prisma.actividadBienestar.findUnique({ where: { id: hallada.id }, select: { id: true, nombre: true, fecha: true, linea: true } });
        if (!a) return { error: "Actividad no encontrada." };
        if (!(await puedeLinea(user, a.linea))) return { error: `No autorizado para consultar actividades de ${a.linea}.` };
        const fotos = await listFotos(a.id);
        if (!fotos.length) return { actividad: a, totalFotos: 0, nota: "Esta actividad no tiene fotos cargadas. Dilo así; se cargan en la pestaña Fotos de la actividad." };
        return {
          actividad: a, totalFotos: fotos.length,
          descripciones: fotos.map((f) => f.descripcion).filter(Boolean).slice(0, 20),
          bloque: "```fotos\n" + JSON.stringify({ actividadId: a.id }) + "\n```",
          nota: "Copia el bloque tal cual en tu respuesta: la interfaz muestra ahí las fotos (miniaturas que se amplían al hacer clic). No describas lo que hay en las fotos más allá de sus descripciones.",
        };
      }
      case "buscar_actividades": {
        const lineas = [];
        for (const l of args.linea ? [args.linea] : ["Bienestar", "Fundación"]) if (await puedeLinea(user, l)) lineas.push(l);
        if (!lineas.length) return { error: "No autorizado para consultar esas actividades." };
        const limite = Math.max(1, Math.min(60, Number(args.limite) || 30));
        const q = String(args.texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const hoy = hoyColombia();
        const hasta = args.realizadas ? [args.hasta, hoy].filter(Boolean).sort()[0] : args.hasta;
        const todas = (await listActividades({ anio: args.anio || undefined })).filter((a) => lineas.includes(a.linea) && (!args.estado || a.estado === args.estado)
          && (!args.realizadas || a.estado === "ejecutada" || a.estado === "cerrada")
          && (!args.desde || (a.fecha && (a.fechaFin || a.fecha) >= args.desde)) && (!hasta || (a.fecha && a.fecha <= hasta))
          && (!q || a.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q)));
        todas.sort((x, y) => String(y.fecha || "").localeCompare(String(x.fecha || "")));
        const porLinea = {}, porEstado = {};
        for (const a of todas) { porLinea[a.linea] = (porLinea[a.linea] || 0) + 1; porEstado[a.estado] = (porEstado[a.estado] || 0) + 1; }
        return { hoy, total: todas.length, porLinea, porEstado, devueltas: Math.min(limite, todas.length), actividades: todas.slice(0, limite).map(filaActividad), nota: todas.length > limite ? `Solo se listan las ${limite} más recientes de ${todas.length}; los conteos son sobre el total.` : undefined };
      }
      case "detalle_actividad": {
        const hallada = await actividadPorIdONombre(args);
        if (hallada.respuesta) return hallada.respuesta;
        const a = await getActividad(hallada.id).catch(() => null);
        if (!a) return { error: "Actividad no encontrada." };
        if (!(await puedeLinea(user, a.linea))) return { error: `No autorizado para consultar actividades de ${a.linea}.` };
        const p = a.participacion;
        return {
          ...filaActividad(a), descripcion: a.descripcion, observaciones: a.observaciones, comentarioDeCierre: a.comentarioCierre,
          comprasAsociadas: a.detalleCompras.slice(0, 20).map((c) => ({ numero: c.localSeq, fecha: c.fechaSolicitud, descripcion: c.descripcion, proveedor: c.proveedor, valorConIva: c.valorConIva, legalizacion: c.estadoLegalizacion })),
          participacion: !a.aplicaParticipantes ? "No aplica: esta actividad no maneja participantes ni asistencia." : { registrados: p.total, inscritos: p.inscritos, asistieron: p.asistieron, noAsistieron: p.noAsistieron, sinRegistrar: p.sinRegistrar, calificacionPromedio: p.calificacionPromedio, porArea: p.porArea.slice(0, 15), motivos: p.motivos },
          inventario: a.inventario.resumen,
          fotos: a.fotos,
          analisisNova: a.analisisNova ? { puntaje: a.analisisNova.puntaje, titulo: a.analisisNova.titulo, resumen: a.analisisNova.resumen } : null,
        };
      }
      case "registro_auditoria": {
        if (!canSeeAuditoria) return { error: "No autorizado para consultar auditoría." };
        const limit = Math.max(1, Math.min(80, Number(args.limit) || 30));
        const { logs } = await listAuditLogs({ from: args.desde, to: args.hasta, pageSize: 300 });
        const filtered = logs.filter((l) => {
          if (args.usuario) {
            const hay = norm(l.userNombre).includes(norm(args.usuario)) || norm(l.userEmail).includes(norm(args.usuario));
            if (!hay) return false;
          }
          // La función "Conectar con Claude" (tokens y consultas MCP) no es tema de Nova por ahora.
          if (ENTIDADES_OCULTAS_A_NOVA.includes(l.entityType)) return false;
          if (args.entidad && !norm(l.entityType).includes(norm(args.entidad))) return false;
          return true;
        });
        return {
          totalCoincidencias: filtered.length,
          movimientosDevueltos: Math.min(limit, filtered.length),
          movimientos: buildAuditoriaResumen(filtered.slice(0, limit)),
        };
      }
      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  };
}
