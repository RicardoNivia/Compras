import { prisma } from "@/lib/prisma";
import { ESTADO_CICLO_LABELS, checklistDe } from "@/lib/proveedoresCicloReglas";
import { indicadoresCiclo } from "@/lib/proveedoresCiclo";

// Informe mensual de proveedores — mismo concepto del informe de la página original de Gestión
// de Proveedores: nuevos, actualizados y excepciones del mes, cambios hechos en la app y la
// situación actual. Los meses se calculan en hora de Colombia (UTC-5).

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const OFFSET_MS = 5 * 60 * 60 * 1000;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function mesActualBogota() {
  const d = new Date(Date.now() - OFFSET_MS);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

const claveMes = (fecha) => {
  const d = new Date(new Date(fecha).getTime() - OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const dos = (n) => String(n).padStart(2, "0");

function partes(fecha) {
  const d = new Date(new Date(fecha).getTime() - OFFSET_MS);
  return { fecha: `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`, hora: `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}` };
}

const areaPrincipal = (a) => (a ? String(a).split("/")[0].trim() : "") || "Sin área";

export async function informeMensual({ anio, mes } = {}) {
  const actual = mesActualBogota();
  const a = anio === undefined || anio === "" ? actual.anio : Number(anio);
  const m = mes === undefined || mes === "" ? actual.mes : Number(mes);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) throw badRequest("Año inválido.");
  if (!Number.isInteger(m) || m < 1 || m > 12) throw badRequest("Mes inválido.");

  const mk = `${a}-${dos(m)}`;
  const ini = new Date(Date.UTC(a, m - 1, 1) + OFFSET_MS);
  const fin = new Date(Date.UTC(a, m, 1) + OFFSET_MS);

  const [todos, logsMes, primerLog] = await Promise.all([
    prisma.proveedor.findMany({
      where: { NOT: { nit: { startsWith: "PEND" } } },
      include: { ciclos: { orderBy: { anio: "desc" }, take: 1, include: { documentos: true } } },
    }),
    prisma.auditLog.findMany({
      where: { entityType: { in: ["proveedor", "cicloProveedor", "configProveedores"] }, createdAt: { gte: ini, lt: fin } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.auditLog.findFirst({ where: { entityType: { in: ["proveedor", "cicloProveedor"] } }, orderBy: { createdAt: "asc" } }),
  ]);

  // Situación de cada proveedor, como la ve el informe original: activo / pendiente / inactivo.
  const fila = (p, fechaCampo) => {
    const ciclo = p.ciclos[0] || null;
    const docs = {};
    for (const d of ciclo?.documentos || []) docs[d.clave] = d.cumple;
    const checklist = checklistDe(p, docs);
    const aprobado = p.activo && !p.esExcepcion && ciclo?.estado === "actualizado";
    const st = !p.activo ? "inactivo" : p.esExcepcion || aprobado ? "activo" : "pendiente";
    const estado = !p.activo ? "Inactivo" : p.esExcepcion ? "Excepción" : ciclo ? ESTADO_CICLO_LABELS[ciclo.estado] : "—";
    return {
      id: p.nit,
      nombre: p.nombre,
      nit: p.nit,
      fecha: partes(p[fechaCampo]).fecha,
      estado,
      st,
      criticidad: p.criticidad || "Sin definir",
      area: p.area || "",
      apto: aprobado && checklist.completos === checklist.total,
      aprobado,
      pendiente: p.activo && !p.esExcepcion && !!ciclo && ciclo.estado !== "actualizado",
    };
  };
  const enMes = (campo) => todos.filter((p) => p[campo] && claveMes(p[campo]) === mk);
  const ordenar = (lista) => lista.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));

  const nuevos = ordenar(enMes("createdAt").map((p) => fila(p, "createdAt")));
  const actualizados = ordenar(enMes("fechaActualizacion").map((p) => fila(p, "fechaActualizacion")));
  const excepciones = ordenar(enMes("fechaExcepcion").map((p) => fila(p, "fechaExcepcion")));

  const conteo = (lista) => ({ activo: lista.filter((r) => r.st === "activo").length, pendiente: lista.filter((r) => r.st === "pendiente").length, inactivo: lista.filter((r) => r.st === "inactivo").length });

  // Tendencia de los últimos 6 meses.
  const tendencia = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    const k = `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}`;
    tendencia.push({
      key: k,
      label: `${MESES_CORTOS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      nuevos: todos.filter((p) => claveMes(p.createdAt) === k).length,
      actualizados: todos.filter((p) => p.fechaActualizacion && claveMes(p.fechaActualizacion) === k).length,
      actual: k === mk,
    });
  }

  // Movimiento del mes por área (top 5).
  const porArea = new Map();
  for (const r of [...nuevos, ...actualizados]) porArea.set(areaPrincipal(r.area), (porArea.get(areaPrincipal(r.area)) || 0) + 1);
  const areas = [...porArea.entries()].map(([area, cantidad]) => ({ area, cantidad })).sort((x, y) => y.cantidad - x.cantidad).slice(0, 5);

  // Gestión en la app.
  const esCarga = (l) => (l.recordInfo || "").startsWith("Carga de archivo");
  const cambiosLogs = logsMes.filter((l) => !esCarga(l));
  const cargas = logsMes.filter(esCarga);
  const parse = (l) => { try { return l.changes ? JSON.parse(l.changes) : []; } catch { return []; } };
  const aprobadosMes = cambiosLogs.filter((l) => l.entityType === "cicloProveedor" && parse(l).some((c) => c.field === "estado" && String(c.after).toLowerCase() === "actualizado")).length;
  const radicMes = cambiosLogs.filter((l) => parse(l).some((c) => c.field === "radicaFacturas" && String(c.after) === "true")).length;
  const editados = new Set(cambiosLogs.filter((l) => !String(l.recordId).startsWith("ciclo-")).map((l) => l.recordId)).size;
  const historial = [...cambiosLogs, ...cargas].sort((x, y) => x.createdAt - y.createdAt).map((l) => {
    const t = partes(l.createdAt);
    const resumen = parse(l).slice(0, 3).map((c) => `${c.label}: ${c.before ?? "—"} → ${c.after ?? "—"}`).join(" · ");
    return { fecha: t.fecha, hora: t.hora, proveedor: (l.recordInfo || "").split(" — ").pop() || "—", usuario: l.userNombre || "Sistema", tipo: esCarga(l) ? "Carga / respaldo" : "Cambio", detalle: [l.recordInfo, resumen].filter(Boolean).join(" — ") };
  });

  // Situación actual (al generar el informe).
  const situacion = {
    registrados: todos.length,
    aprobados: todos.filter((p) => fila(p, "createdAt").aprobado).length,
    aptos: todos.filter((p) => fila(p, "createdAt").apto).length,
    pendientes: todos.filter((p) => fila(p, "createdAt").pendiente).length,
    inactivos: todos.filter((p) => !p.activo).length,
    facturando: todos.filter((p) => p.esExcepcion && p.radicaFacturas).length,
  };

  // Meses disponibles: desde el primer movimiento hasta hoy.
  const fechas = [primerLog?.createdAt, ...todos.map((p) => p.createdAt), ...todos.map((p) => p.fechaActualizacion).filter(Boolean)].filter(Boolean);
  const desde = fechas.length ? Math.min(...fechas.map((f) => Number(claveMes(f).slice(0, 4)))) : actual.anio;
  const aniosDisponibles = [];
  for (let y = actual.anio; y >= Math.min(desde, actual.anio, a); y--) aniosDisponibles.push(y);

  return {
    anio: a,
    mes: m,
    titulo: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}`,
    meses: MESES,
    aniosDisponibles,
    kpis: { nuevos: nuevos.length, actualizados: actualizados.length, cambios: cambiosLogs.length, pasadosAprobado: aprobadosMes },
    estadoNuevos: conteo(nuevos),
    estadoActualizados: conteo(actualizados),
    tendencia,
    areas,
    nuevos,
    actualizados,
    excepciones,
    gestion: { proveedoresConCambios: editados, radicaciones: radicMes, cargas: cargas.length },
    situacion,
    historial,
  };
}

// Excel del informe (mismas hojas del original): Resumen, Nuevos del mes, Actualizados del mes,
// Excepciones del mes (si hay) y Cambios del mes.
export async function informeExcelBuffer(params) {
  const mod = await import("xlsx");
  const XLSX = mod.default?.utils ? mod.default : mod;
  const d = await informeMensual(params);
  const wb = XLSX.utils.book_new();
  const hoy = partes(new Date()).fecha;
  const resumen = [
    [`Informe mensual de proveedores — ${d.titulo}`], [`Generado el ${hoy}`], [],
    ["MOVIMIENTO DEL MES", "Cantidad"],
    ["Proveedores nuevos", d.kpis.nuevos], ["   Activos (aprobados)", d.estadoNuevos.activo], ["   Pendientes", d.estadoNuevos.pendiente], ["   Inactivos", d.estadoNuevos.inactivo],
    ["Proveedores actualizados", d.kpis.actualizados], ["   Activos (aprobados)", d.estadoActualizados.activo], ["   Pendientes", d.estadoActualizados.pendiente], ["   Inactivos", d.estadoActualizados.inactivo],
    ["Excepciones con fecha en el mes", d.excepciones.length],
    ["Cambios hechos en la app", d.kpis.cambios], ["Proveedores con cambios", d.gestion.proveedoresConCambios], ["Estados cambiados a Actualizado", d.kpis.pasadosAprobado],
    ["Radicaciones de facturas marcadas", d.gestion.radicaciones], ["Cargas de archivo / respaldos", d.gestion.cargas], [],
    ["SITUACIÓN ACTUAL (al generar el informe)", "Cantidad"],
    ["Proveedores registrados", d.situacion.registrados], ["Aprobados con checklist", d.situacion.aprobados], ["Aptos para orden de compra", d.situacion.aptos],
    ["Pendientes", d.situacion.pendientes], ["Inactivos", d.situacion.inactivos], ["Excepciones facturando (radicación)", d.situacion.facturando],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(resumen);
  ws1["!cols"] = [{ wch: 46 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen");
  const filaXlsx = (r) => ({ "Razón social": r.nombre, NIT: r.nit, Fecha: r.fecha, Estado: r.estado, Situación: r.st === "activo" ? "Activo" : r.st === "pendiente" ? "Pendiente" : "Inactivo", Criticidad: r.criticidad, Área: r.area, "Apto para OC": r.apto ? "Sí" : "No" });
  const hoja = (nombre, lista, vacio) => {
    const ws = lista.length ? XLSX.utils.json_to_sheet(lista.map(filaXlsx)) : XLSX.utils.aoa_to_sheet([[vacio]]);
    ws["!cols"] = [{ wch: 44 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 11 }, { wch: 12 }, { wch: 24 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };
  hoja("Nuevos del mes", d.nuevos, `No hay proveedores nuevos con fecha en ${d.titulo}.`);
  hoja("Actualizados del mes", d.actualizados, `No hay proveedores actualizados con fecha en ${d.titulo}.`);
  if (d.excepciones.length) hoja("Excepciones del mes", d.excepciones, "");
  const ws4 = d.historial.length
    ? XLSX.utils.json_to_sheet(d.historial.map((h) => ({ Fecha: h.fecha, Hora: h.hora, Proveedor: h.proveedor, Usuario: h.usuario, Tipo: h.tipo, Detalle: h.detalle })))
    : XLSX.utils.aoa_to_sheet([[`No se registraron cambios en la app en ${d.titulo}.`]]);
  ws4["!cols"] = [{ wch: 12 }, { wch: 7 }, { wch: 40 }, { wch: 22 }, { wch: 16 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Cambios del mes");
  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), nombre: `Informe_Mensual_Proveedores_${d.anio}-${dos(d.mes)}.xlsx` };
}

// Excel de los indicadores (dashboard de proveedores): una hoja por bloque.
export async function indicadoresExcelBuffer() {
  const mod = await import("xlsx");
  const XLSX = mod.default?.utils ? mod.default : mod;
  const d = await indicadoresCiclo();
  const wb = XLSX.utils.book_new();
  const hoja = (nombre, filas, anchos) => {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws["!cols"] = (anchos || [40, 16]).map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  };
  hoja("Resumen", [
    [`Indicadores de proveedores — ciclo ${d.anio}`], [`Generado el ${partes(new Date()).fecha}`], [],
    ["Indicador", "Valor"],
    ["Proveedores en el ciclo", d.enCiclo], ["Total de proveedores", d.total], ["% actualizados", `${d.pctActualizado}%`],
    ["Días para el corte", d.diasParaCorte], ["Checklist incompleto", d.checklistIncompleto],
    ["Críticos (Actualización)", d.criticos.total], ["Críticos pendientes", d.criticos.pendientes],
    ["Compras con proveedor en alerta", d.comprasConAlerta.registros], ["Valor de esas compras", d.comprasConAlerta.valor],
    [`Pasarán a Desactualizado en el ciclo ${d.proximoCiclo.anio}`, d.proximoCiclo.desactualizados],
  ], [46, 18]);
  hoja("Clasificación", [["Clasificación", "Proveedores"], ["Actualización", d.clasificacion.actualizacion], ["Nuevos", d.clasificacion.nuevo], ["Excepciones", d.clasificacion.excepcion], ["Inactivos", d.clasificacion.inactivo], ["Por registrar", d.clasificacion.por_registrar]]);
  hoja("Estado del ciclo", [["Estado", "Proveedores"], ...Object.entries(d.estados).map(([k, v]) => [ESTADO_CICLO_LABELS[k] || k, v])]);
  hoja("Criticidad", [["Criticidad", "Proveedores"], ...Object.entries(d.criticidad).map(([k, v]) => [k, v])]);
  hoja("Avance por área", [["Área", "Actualizado", "En trámite", "Desactualizado", "% avance"], ...d.areas.map((a) => { const t = a.actualizado + a.aprobacion + a.sinActualizar; return [a.area, a.actualizado, a.aprobacion, a.sinActualizar, t ? Math.round((a.actualizado / t) * 100) : 0]; })], [34, 14, 14, 16, 12]);
  hoja("Actualizaciones por mes", [["Mes", "Actualizados"], ...d.porMes.map((m) => [m.label, m.value])]);
  hoja("Críticos pendientes", [["Proveedor", "NIT", "Área", "Estado"], ...d.atencion.map((p) => [p.nombre, p.nit, p.area || "", p.estadoLabel])], [44, 16, 22, 18]);
  hoja("Compras en alerta", [["Proveedor", "Compras", "Valor"], ...d.comprasConAlerta.top.map((p) => [p.nombre, p.registros, p.valor])], [44, 12, 18]);
  return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), nombre: `Indicadores_Proveedores_${d.anio}.xlsx` };
}
