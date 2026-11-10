import { prisma } from "@/lib/prisma";
import { valoracionGeneralPorProveedor } from "@/lib/valoraciones";
import { publicarEvento, publicarCambiosDeProveedor } from "@/lib/notificacionesEventos";
import {
  logCicloEstado, logCicloDocumento, logCicloIniciado, logProveedorUpdate, logConfigProveedoresUpdate,
} from "@/lib/audit";
import {
  CONFIG_PROVEEDORES_DEFAULT, ESTADO_CICLO_LABELS, CLAVES_CHECKLIST, CLASIFICACION_LABELS,
  anioCicloVigente, inicioCiclo, finCicloFecha, diasParaCorte, clasificacionEn, estadoInicial,
  checklistDe, alertaCompras, puedeCambiarEstado, validarConfig, esCritico, claveCriticidad,
} from "@/lib/proveedoresCicloReglas";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function notFound(message = "Proveedor no encontrado.") {
  const err = new Error(message);
  err.status = 404;
  return err;
}

// ---------- Configuración ----------

// Última configuración leída: las clasificaciones usan el corte vigente sin pasar la config por cada función.
let cfgActual = { ...CONFIG_PROVEEDORES_DEFAULT };
const clasif = (p, anio) => clasificacionEn(p, anio, cfgActual);

export async function getConfigProveedores() {
  const row = await prisma.configProveedores.findFirst();
  cfgActual = row ? { diaCorte: row.diaCorte, mesCorte: row.mesCorte, diasAviso: row.diasAviso } : { ...CONFIG_PROVEEDORES_DEFAULT };
  return { ...cfgActual };
}

export async function updateConfigProveedores(body, actor) {
  const next = {
    diaCorte: Number(body.diaCorte),
    mesCorte: Number(body.mesCorte),
    diasAviso: Number(body.diasAviso),
  };
  const error = validarConfig(next);
  if (error) throw badRequest(error);

  const before = await getConfigProveedores();
  const existing = await prisma.configProveedores.findFirst();
  if (existing) await prisma.configProveedores.update({ where: { id: existing.id }, data: next });
  else await prisma.configProveedores.create({ data: next });

  await logConfigProveedoresUpdate(actor, before, next).catch(() => {});
  return next;
}

// ---------- Ciclo vigente y su inicio (1 de abril) ----------

// Crea la fila de ciclo de un proveedor si todavía no existe. Devuelve null si
// el proveedor no entra al ciclo (excepción, inactivo o creado después del ciclo).
// El estado inicial sale de la fecha de ÚLTIMA ACTUALIZACIÓN (ver estadoInicial).
async function getOrCreateCiclo(proveedor, anio, tx = prisma) {
  const clasificacion = clasif(proveedor, anio);
  if (clasificacion !== "actualizacion" && clasificacion !== "nuevo") return null;
  const estado = estadoInicial(proveedor, anio, cfgActual);
  return tx.proveedorCiclo.upsert({
    where: { proveedorNit_anio: { proveedorNit: proveedor.nit, anio } },
    update: {},
    create: {
      proveedorNit: proveedor.nit, anio, clasificacion, estado,
      aprobadoAt: estado === "actualizado" ? proveedor.fechaActualizacion : null,
      aprobadoPorNombre: estado === "actualizado" ? "Última actualización registrada" : null,
    },
  });
}

// Asegura el estado del ciclo vigente de un proveedor recién creado, reactivado o
// al que se le quitó la excepción (no hace nada si no participa en el ciclo).
export async function asegurarCicloDe(proveedor) {
  const anio = await asegurarCicloVigente();
  return getOrCreateCiclo(proveedor, anio);
}

// Se ejecuta en cada lectura del módulo: si el ciclo vigente aún no se inició,
// crea el estado de todos los proveedores que entran y lo marca como iniciado.
// Es idempotente (CicloProveedorIniciado.anio es único).
export async function asegurarCicloVigente(now = new Date()) {
  const cfg = await getConfigProveedores();
  const anio = anioCicloVigente(now, cfg);
  const ya = await prisma.cicloProveedorIniciado.findUnique({ where: { anio } });
  if (ya) return anio;

  const proveedores = await prisma.proveedor.findMany();
  let cantidad = 0;
  await prisma.$transaction(async (tx) => {
    const marca = await tx.cicloProveedorIniciado.findUnique({ where: { anio } });
    if (marca) return;
    for (const p of proveedores) {
      const fila = await getOrCreateCiclo(p, anio, tx);
      if (fila && fila.estado === "desactualizado") cantidad++;
    }
    await tx.cicloProveedorIniciado.create({ data: { anio, cantidad } });
  });
  await logCicloIniciado(anio, cantidad).catch(() => {});
  return anio;
}

// ---------- Vistas de proveedor ----------

async function cargarProveedorCompleto(nit) {
  const row = await prisma.proveedor.findUnique({
    where: { nit },
    include: { ciclos: { include: { documentos: true }, orderBy: { anio: "desc" } } },
  });
  return row;
}

// Solo las marcas explícitas: un requisito sin marca usa su valor automático (ver checklistDe).
function documentosDe(ciclo) {
  const docs = {};
  for (const d of ciclo?.documentos || []) docs[d.clave] = d.cumple;
  return docs;
}

function filaCiclo(ciclo) {
  if (!ciclo) return null;
  return {
    anio: ciclo.anio,
    clasificacion: ciclo.clasificacion,
    clasificacionLabel: CLASIFICACION_LABELS[ciclo.clasificacion] || ciclo.clasificacion,
    estado: ciclo.estado,
    estadoLabel: ESTADO_CICLO_LABELS[ciclo.estado] || ciclo.estado,
    aprobadoPorNombre: ciclo.aprobadoPorNombre,
    aprobadoAt: ciclo.aprobadoAt,
    documentos: documentosDe(ciclo),
  };
}

function toClienteProveedor(p) {
  return {
    id: p.nit, // la llave primaria es el NIT
    nit: p.nit,
    nombre: p.nombre,
    descripcion: p.descripcion,
    telefono: p.telefono,
    correo: p.correo,
    internacional: p.internacional,
    activo: p.activo,
    inactivoMotivo: p.inactivoMotivo,
    tipoProveedorId: p.tipoProveedorId,
    criticidad: p.criticidad,
    areaId: p.areaId,
    area: p.area,
    tipoServicioId: p.tipoServicioId,
    servicio: p.servicio,
    clasificacionMontoId: p.clasificacionMontoId,
    clasificacionMonto: p.clasificacionMonto,
    revision: p.revision,
    observacion: p.observacion,
    fechaInvitacion: p.fechaInvitacion,
    creadoPorNombre: p.creadoPorNombre,
    esExcepcion: p.esExcepcion,
    motivoExcepcionId: p.motivoExcepcionId,
    motivoExcepcion: p.motivoExcepcion,
    justificacionExcepcion: p.justificacionExcepcion,
    radicaFacturas: p.radicaFacturas,
    fechaActualizacion: p.fechaActualizacion,
    createdAt: p.createdAt,
  };
}

// Un proveedor con su estado del ciclo vigente, checklist y alerta de Compras.
function resumenProveedor(p, anio, ciclo) {
  const fila = filaCiclo(ciclo);
  const manuales = fila ? fila.documentos : {};
  const checklist = checklistDe(p, manuales);
  const clasificacion = clasif(p, anio);
  return {
    ...toClienteProveedor(p),
    clasificacion,
    clasificacionLabel: CLASIFICACION_LABELS[clasificacion] || clasificacion,
    ciclo: fila,
    checklist,
    alerta: alertaCompras(p, ciclo ? { ...fila, anio } : null, checklist),
  };
}

export async function getProveedorDetalle(nit) {
  const anio = await asegurarCicloVigente();
  const p = await cargarProveedorCompleto(nit);
  if (!p) throw notFound();
  const cicloVigente = p.ciclos.find((c) => c.anio === anio) || null;
  const resumen = resumenProveedor(p, anio, cicloVigente);
  const historial = p.ciclos.filter((c) => c.anio !== anio).map(filaCiclo);
  const diasSinGestion = cicloVigente ? Math.floor((Date.now() - new Date(cicloVigente.updatedAt).getTime()) / 86400000) : null;
  const valoracionIA = (await valoracionGeneralPorProveedor()).get(p.nit) || null;
  return { anio, ...resumen, valoracionIA, diasSinGestion, historial, fechaCorte: finCicloFecha(anio, await getConfigProveedores()), inicioCiclo: inicioCiclo(anio, await getConfigProveedores()) };
}

// ---------- Listado del maestro (con filtros combinables) ----------

export async function listMaestroProveedores(filtros = {}) {
  const anio = await asegurarCicloVigente();
  const rows = await prisma.proveedor.findMany({
    orderBy: { nombre: "asc" },
    include: { ciclos: { where: { anio }, include: { documentos: true } } },
  });

  // Cuántos registros de compra usan cada proveedor: con alguno, no se puede eliminar.
  const usos = await prisma.record.groupBy({ by: ["proveedorNit"], where: { proveedorNit: { not: null } }, _count: { _all: true } });
  const registrosPorNit = new Map(usos.map((u) => [u.proveedorNit, u._count._all]));
  // Calificación general con IA: promedio del puntaje de proveedor de sus compras valoradas.
  const valoraciones = await valoracionGeneralPorProveedor();
  const todos = rows.map((p) => ({
    ...resumenProveedor(p, anio, p.ciclos[0] || null),
    registrosCompras: registrosPorNit.get(p.nit) || 0,
    valoracionIA: valoraciones.get(p.nit) || null,
  }));

  const q = String(filtros.q || "").trim().toLowerCase();
  const clasif = filtros.clasificacion ? [].concat(filtros.clasificacion) : [];
  const estados = filtros.estado ? [].concat(filtros.estado) : [];
  const checklist = filtros.checklist || "";
  // Acepta la clave (critico / no_critico / sin_definir) o el texto del maestro ("Crítico", "No crítico"…).
  const criticidad = !filtros.criticidad ? "" : ["critico", "no_critico", "sin_definir"].includes(filtros.criticidad) ? filtros.criticidad : claveCriticidad(filtros.criticidad);
  const tipoProveedorId = filtros.tipoProveedorId || "";
  const clasificacionMontoId = filtros.clasificacionMontoId || "";
  const tipoServicioId = filtros.tipoServicioId || "";
  const areaId = filtros.areaId || "";
  const excepcion = filtros.excepcion || "";
  // Fecha de registro (aaaa-mm-dd, día de Colombia) desde / hasta, ambas incluidas.
  const dia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : "");
  const registradoDesde = dia(filtros.registradoDesde);
  const registradoHasta = dia(filtros.registradoHasta);

  const filtrados = todos.filter((r) => {
    if (clasif.length && !clasif.includes(r.clasificacion)) return false;
    if (estados.length && !(r.ciclo && estados.includes(r.ciclo.estado))) return false;
    if (checklist === "completo" && r.checklist.completos !== r.checklist.total) return false;
    if (checklist === "incompleto" && r.checklist.completos === r.checklist.total) return false;
    if (criticidad && claveCriticidad(r.criticidad) !== criticidad) return false;
    if (tipoProveedorId && r.tipoProveedorId !== tipoProveedorId) return false;
    if (clasificacionMontoId && r.clasificacionMontoId !== clasificacionMontoId) return false;
    if (tipoServicioId && r.tipoServicioId !== tipoServicioId) return false;
    if (areaId && r.areaId !== areaId) return false;
    if (excepcion === "si" && !r.esExcepcion) return false;
    if (excepcion === "no" && r.esExcepcion) return false;
    if (registradoDesde || registradoHasta) {
      // Los "Por registrar" (NIT provisional) nunca se registraron: su createdAt es la fecha de la
      // migración histórica, no un registro real, así que no entran en un filtro por fecha de registro.
      if (r.clasificacion === "por_registrar") return false;
      const diaRegistro = fechaDia(r.createdAt) || "";
      if (registradoDesde && diaRegistro < registradoDesde) return false;
      if (registradoHasta && diaRegistro > registradoHasta) return false;
    }
    if (q && !`${r.nombre} ${r.nit}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const conteos = {
    clasificacion: { actualizacion: 0, nuevo: 0, excepcion: 0, inactivo: 0, por_registrar: 0 },
    estado: { desactualizado: 0, en_proceso: 0, en_aprobacion: 0, actualizado: 0 },
  };
  for (const r of todos) {
    if (conteos.clasificacion[r.clasificacion] !== undefined) conteos.clasificacion[r.clasificacion]++;
    if (r.ciclo && conteos.estado[r.ciclo.estado] !== undefined) conteos.estado[r.ciclo.estado]++;
  }

  const cfg = await getConfigProveedores();
  return { anio, diasParaCorte: diasParaCorte(new Date(), cfg), inicioCiclo: inicioCiclo(anio, cfg), total: todos.length, conteos, rows: filtrados };
}

// ---------- Cambios sobre el ciclo ----------

async function cicloVigenteDe(nit, anio) {
  const p = await cargarProveedorCompleto(nit);
  if (!p) throw notFound();
  const ciclo = await getOrCreateCiclo(p, anio);
  if (!ciclo) throw badRequest("Este proveedor no participa en el ciclo de actualización (excepción, inactivo o posterior al ciclo).");
  return { p, ciclo: await prisma.proveedorCiclo.findUnique({ where: { id: ciclo.id }, include: { documentos: true } }) };
}

const fechaDia = (d) => (d ? new Date(new Date(d).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10) : null);

// Fecha de actualización que se informa al aprobar (aaaa-mm-dd, día de Colombia). Debe caer dentro
// del ciclo vigente (si no, el proveedor no contaría como actualizado) y no puede ser futura.
async function fechaActualizacionDe(valor, anio) {
  const m = String(valor || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw badRequest("Indica la fecha de actualización del proveedor.");
  // Mediodía en Colombia, para no caer en el borde de un corte de ciclo.
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 17));
  if (fecha.getUTCDate() !== Number(m[3])) throw badRequest("La fecha de actualización no es válida.");
  if (valor > fechaDia(new Date())) throw badRequest("La fecha de actualización no puede ser futura.");
  const inicio = inicioCiclo(anio, await getConfigProveedores());
  if (fecha < inicio) throw badRequest(`La fecha de actualización debe ser del ciclo ${anio} (desde el ${inicio.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}).`);
  return fecha;
}

export async function cambiarEstadoCiclo(nit, { estado, fechaActualizacion }, actor) {
  const anio = await asegurarCicloVigente();
  const { p, ciclo } = await cicloVigenteDe(nit, anio);
  const checklist = checklistDe(p, documentosDe(ciclo));
  const check = puedeCambiarEstado(ciclo.estado, estado, checklist.completos === checklist.total);
  if (!check.ok) throw badRequest(check.motivo);

  const antes = filaCiclo(ciclo);
  const data = { estado };
  if (estado === "actualizado") {
    data.aprobadoPorUserId = actor?.id || null;
    data.aprobadoPorNombre = actor?.nombre || null;
    data.aprobadoAt = await fechaActualizacionDe(fechaActualizacion, anio);
  } else {
    // Al salir de "actualizado" ya no hay aprobación vigente.
    data.aprobadoPorUserId = null;
    data.aprobadoPorNombre = null;
    data.aprobadoAt = null;
  }
  const actualizado = await prisma.proveedorCiclo.update({ where: { id: ciclo.id }, data, include: { documentos: true } });
  // La fecha de última actualización es la base del cálculo del ciclo.
  if (estado === "actualizado") await prisma.proveedor.update({ where: { nit: p.nit }, data: { fechaActualizacion: data.aprobadoAt } });
  const fechaAntes = fechaDia(p.fechaActualizacion);
  await logCicloEstado(actor, p, anio,
    { estado: antes.estado, fechaActualizacion: fechaAntes },
    { estado, fechaActualizacion: estado === "actualizado" ? fechaDia(data.aprobadoAt) : fechaAntes }).catch(() => {});
  if (antes.estado !== estado) {
    publicarEvento("proveedor.ciclo_cambio", { entidadId: p.nit, clave: `proveedor.ciclo_cambio|${p.nit}|${anio}|${Date.now()}`, datos: { nit: p.nit, nombre: p.nombre, anio, de: antes.estado, a: estado }, actor });
  }
  const fechaFinal = estado === "actualizado" ? data.aprobadoAt : p.fechaActualizacion;
  return { anio, ...resumenProveedor({ ...p, fechaActualizacion: fechaFinal }, anio, actualizado) };
}

export async function setDocumentoCiclo(nit, { clave, cumple }, actor) {
  if (!CLAVES_CHECKLIST.includes(clave)) throw badRequest("Requisito inválido.");
  const anio = await asegurarCicloVigente();
  const { p, ciclo } = await cicloVigenteDe(nit, anio);
  const previo = await prisma.proveedorCicloDocumento.findUnique({ where: { cicloId_clave: { cicloId: ciclo.id, clave } } });
  const valor = !!cumple;
  await prisma.proveedorCicloDocumento.upsert({
    where: { cicloId_clave: { cicloId: ciclo.id, clave } },
    update: { cumple: valor, verificadoPorUserId: valor ? actor?.id || null : null, verificadoPorNombre: valor ? actor?.nombre || null : null, verificadoAt: valor ? new Date() : null },
    create: { cicloId: ciclo.id, clave, cumple: valor, verificadoPorUserId: valor ? actor?.id || null : null, verificadoPorNombre: valor ? actor?.nombre || null : null, verificadoAt: valor ? new Date() : null },
  });
  await logCicloDocumento(actor, p, anio, clave, !!previo?.cumple, valor).catch(() => {});
  const actualizado = await prisma.proveedorCiclo.findUnique({ where: { id: ciclo.id }, include: { documentos: true } });
  return { anio, ...resumenProveedor(p, anio, actualizado) };
}

// Excepciones e inactivos. Nunca borran el histórico: solo cambian la clasificación.
export async function cambiarClasificacion(nit, { accion, motivoExcepcionId, justificacion, inactivoMotivo, radica }, actor) {
  const anio = await asegurarCicloVigente();
  const antes = await prisma.proveedor.findUnique({ where: { nit } });
  if (!antes) throw notFound();
  const before = toClienteProveedor(antes);
  let data;

  if (accion === "excepcion") {
    const motivo = motivoExcepcionId
      ? await prisma.maestro.findFirst({ where: { id: motivoExcepcionId, tipo: "motivoExcepcion", activo: true } })
      : null;
    if (!motivo) throw badRequest("Elige un motivo de excepción válido (Maestros › Proveedores).");
    data = {
      esExcepcion: true,
      motivoExcepcionId: motivo.id,
      motivoExcepcion: motivo.valor,
      justificacionExcepcion: String(justificacion || "").trim() || null,
      fechaExcepcion: new Date(),
    };
  } else if (accion === "radicar") {
    if (!antes.esExcepcion) throw badRequest("Solo las excepciones radican facturas.");
    data = { radicaFacturas: !!radica, radicaFacturasAt: radica ? new Date() : null };
  } else if (accion === "quitar-excepcion") {
    data = { esExcepcion: false, motivoExcepcionId: null, motivoExcepcion: null, justificacionExcepcion: null, fechaExcepcion: null, radicaFacturas: false, radicaFacturasAt: null };
  } else if (accion === "inactivar") {
    const motivo = String(inactivoMotivo || "").trim();
    if (!motivo) throw badRequest("Indica el motivo de inactivación.");
    data = { activo: false, inactivoMotivo: motivo };
  } else if (accion === "reactivar") {
    data = { activo: true, inactivoMotivo: null };
  } else {
    throw badRequest("Acción inválida.");
  }

  const row = await prisma.proveedor.update({ where: { nit }, data });
  // Al quitar una excepción o reactivar, el proveedor entra al ciclo vigente.
  if (accion === "quitar-excepcion" || accion === "reactivar") await getOrCreateCiclo(row, anio);

  await logProveedorUpdate(actor, before, toClienteProveedor(row)).catch(() => {});
  publicarCambiosDeProveedor(before, toClienteProveedor(row), actor);
  return getProveedorDetalle(nit);
}

// ---------- Indicadores ----------

// Claves de salida del indicador de criticidad (las que pinta IndicadoresProveedores).
const CRITICIDAD_INDICADOR = { critico: "Critico", no_critico: "No crítico", sin_definir: "Sin definir" };

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Mes (aaaa-mm) en hora de Colombia, igual que las reglas de corte.
function claveMes(fecha) {
  const d = new Date(new Date(fecha).getTime() - 5 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function indicadoresCiclo() {
  const anio = await asegurarCicloVigente();
  const cfg = await getConfigProveedores();
  const inicio = inicioCiclo(anio, cfg);
  const proveedores = await prisma.proveedor.findMany({
    include: { ciclos: { where: { anio }, include: { documentos: true } } },
  });

  const clasificacion = { actualizacion: 0, nuevo: 0, excepcion: 0, inactivo: 0, por_registrar: 0 };
  const estados = { desactualizado: 0, en_proceso: 0, en_aprobacion: 0, actualizado: 0 };
  const criticidad = { Critico: 0, "No crítico": 0, "Sin definir": 0 };
  const mapa = { actualizado: 0, en_aprobacion: 0, en_proceso: 0, desactualizado: 0, nuevo: 0, excepcion: 0, inactivo: 0 };
  const areas = new Map();
  const mesesActualizados = new Map();
  const atencion = [];
  const conAlerta = new Map();
  let criticos = 0;
  let criticosPendientes = 0;
  let checklistIncompleto = 0;

  for (const p of proveedores) {
    const ciclo = p.ciclos[0] || null;
    const cls = clasif(p, anio);
    if (clasificacion[cls] !== undefined) clasificacion[cls]++;

    const fila = filaCiclo(ciclo);
    const checklist = checklistDe(p, fila ? fila.documentos : {});
    const alerta = alertaCompras(p, ciclo ? { ...fila, anio } : null, checklist);
    if (alerta.nivel === "aviso" || alerta.nivel === "inactivo") conAlerta.set(p.nit, p);

    if (cls === "por_registrar") continue;
    if (cls === "excepcion" || cls === "inactivo") {
      mapa[cls]++;
      continue;
    }

    criticidad[CRITICIDAD_INDICADOR[claveCriticidad(p.criticidad)]]++;
    if (cls === "nuevo") mapa.nuevo++;
    if (!ciclo) continue;

    mapa[ciclo.estado]++;
    estados[ciclo.estado]++;
    if (checklist.completos < checklist.total) checklistIncompleto++;

    if (ciclo.estado === "actualizado" && ciclo.aprobadoAt && new Date(ciclo.aprobadoAt) >= inicio) {
      const k = claveMes(ciclo.aprobadoAt);
      mesesActualizados.set(k, (mesesActualizados.get(k) || 0) + 1);
    }

    if (cls === "actualizacion") {
      const area = p.area || "Sin área";
      const a = areas.get(area) || { area, actualizado: 0, aprobacion: 0, sinActualizar: 0 };
      if (ciclo.estado === "actualizado") a.actualizado++;
      else if (ciclo.estado === "en_aprobacion" || ciclo.estado === "en_proceso") a.aprobacion++;
      else a.sinActualizar++;
      areas.set(area, a);

      if (esCritico(p.criticidad)) {
        criticos++;
        if (ciclo.estado !== "actualizado") {
          criticosPendientes++;
          atencion.push({ id: p.nit, nombre: p.nombre, nit: p.nit, area: p.area, estado: ciclo.estado, estadoLabel: ESTADO_CICLO_LABELS[ciclo.estado], fechaActualizacion: p.fechaActualizacion });
        }
      }
    }
  }

  // Meses del ciclo (abr → mar con el corte por defecto), con 0 donde no hubo actualizaciones.
  const porMes = [];
  const base = new Date(inicio.getTime() - 5 * 60 * 60 * 1000);
  const ahora = claveMes(new Date());
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    porMes.push({ key, label: MESES_CORTOS[d.getUTCMonth()], value: mesesActualizados.get(key) || 0, highlighted: key === ahora });
  }

  // Compras del ciclo hechas con proveedores que hoy tienen alerta (desactualizados o inactivos).
  let comprasConAlerta = { proveedores: 0, registros: 0, valor: 0, top: [] };
  if (conAlerta.size) {
    const desde = new Date(inicio.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const grupos = await prisma.record.groupBy({
      by: ["proveedorNit"],
      where: { proveedorNit: { in: [...conAlerta.keys()] }, fechaSolicitud: { gte: desde } },
      _count: { _all: true },
      _sum: { valorConIva: true },
    });
    const top = grupos
      .map((g) => ({ nombre: conAlerta.get(g.proveedorNit)?.nombre || "—", registros: g._count._all, valor: g._sum.valorConIva || 0 }))
      .sort((a, b) => b.valor - a.valor);
    comprasConAlerta = {
      proveedores: grupos.length,
      registros: grupos.reduce((s, g) => s + g._count._all, 0),
      valor: grupos.reduce((s, g) => s + (g._sum.valorConIva || 0), 0),
      top: top.slice(0, 5),
    };
  }

  // Los proveedores que entran al próximo ciclo: activos, no excepción y ya creados.
  const proximoCiclo = proveedores.filter((p) => {
    const c = clasif(p, anio + 1);
    return c === "actualizacion" || c === "nuevo";
  }).length;

  const enCiclo = estados.desactualizado + estados.en_proceso + estados.en_aprobacion + estados.actualizado;

  return {
    anio,
    diasParaCorte: diasParaCorte(new Date(), cfg),
    total: proveedores.length,
    enCiclo,
    pctActualizado: enCiclo ? Math.round((estados.actualizado / enCiclo) * 100) : 0,
    clasificacion,
    estados,
    mapa,
    criticidad,
    checklistIncompleto,
    porMes,
    areas: [...areas.values()].sort((a, b) => (b.actualizado + b.aprobacion + b.sinActualizar) - (a.actualizado + a.aprobacion + a.sinActualizar)),
    criticos: { total: criticos, pendientes: criticosPendientes },
    atencion: atencion.slice(0, 10),
    comprasConAlerta,
    proximoCiclo: { anio: anio + 1, desactualizados: proximoCiclo, fecha: finCicloFecha(anio, cfg) },
  };
}

// Mapa NIT → alerta del ciclo vigente, para la tabla de Registros (Record.proveedorNit).
export async function alertasPorProveedor() {
  const anio = await asegurarCicloVigente();
  const rows = await prisma.proveedor.findMany({ include: { ciclos: { where: { anio }, include: { documentos: true } } } });
  const out = {};
  for (const p of rows) {
    const ciclo = p.ciclos[0] || null;
    const fila = filaCiclo(ciclo);
    const checklist = checklistDe(p, fila ? fila.documentos : {});
    const alerta = alertaCompras(p, ciclo ? { ...fila, anio } : null, checklist);
    if (alerta.nivel !== "ok") out[p.nit] = { nivel: alerta.nivel, titulo: alerta.titulo, detalle: alerta.detalle };
  }
  return out;
}

// ---------- Acciones masivas (varios proveedores a la vez) ----------

// Lista de NIT seleccionados (la llave primaria del proveedor).
function idsDe(ids) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && x))].slice(0, 500);
  if (!lista.length) throw badRequest("Selecciona al menos un proveedor.");
  return lista;
}

// "Marcar todos los requisitos" (cumple=true) o "Restablecer" (cumple=false: se borran las marcas
// y cada requisito vuelve a su valor automático). Una sola entrada de auditoría por proveedor.
export async function setChecklistMasivo(ids, cumple, actor) {
  const lista = idsDe(ids);
  const anio = await asegurarCicloVigente();
  let actualizados = 0;
  const omitidos = [];
  for (const id of lista) {
    try {
      const { p, ciclo } = await cicloVigenteDe(id, anio);
      const antes = checklistDe(p, documentosDe(ciclo)).completos;
      if (cumple) {
        const verificado = { verificadoPorUserId: actor?.id || null, verificadoPorNombre: actor?.nombre || null, verificadoAt: new Date() };
        for (const clave of CLAVES_CHECKLIST) {
          await prisma.proveedorCicloDocumento.upsert({
            where: { cicloId_clave: { cicloId: ciclo.id, clave } },
            update: { cumple: true, ...verificado },
            create: { cicloId: ciclo.id, clave, cumple: true, ...verificado },
          });
        }
      } else {
        await prisma.proveedorCicloDocumento.deleteMany({ where: { cicloId: ciclo.id } });
      }
      const despuesCiclo = await prisma.proveedorCiclo.findUnique({ where: { id: ciclo.id }, include: { documentos: true } });
      const despues = checklistDe(p, documentosDe(despuesCiclo)).completos;
      await logCicloDocumento(actor, p, anio, "checklist", `${antes}/6`, `${despues}/6`).catch(() => {});
      actualizados++;
    } catch (err) {
      omitidos.push({ id, motivo: err.message });
    }
  }
  return { actualizados, omitidos };
}

// Cambia el estado del ciclo de varios proveedores. "actualizado" solo aplica a los que ya
// tienen el checklist completo; el resto se reporta en "omitidos" con su motivo.
export async function cambiarEstadoMasivo(ids, estado, actor, fechaActualizacion) {
  const lista = idsDe(ids);
  let actualizados = 0;
  const omitidos = [];
  for (const id of lista) {
    try {
      await cambiarEstadoCiclo(id, { estado, fechaActualizacion }, actor);
      actualizados++;
    } catch (err) {
      omitidos.push({ id, motivo: err.message });
    }
  }
  return { actualizados, omitidos };
}
