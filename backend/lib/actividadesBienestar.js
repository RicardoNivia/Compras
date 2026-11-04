import { prisma } from "@/lib/prisma";
import { logActividadCreate, logActividadUpdate, logActividadDelete, logCompraDeActividad } from "@/lib/audit";
import { resumenParticipacion } from "@/lib/participantesBienestar";
import { listInventario, resumenInventario } from "@/lib/inventarioBienestar";
import { clasificarEnSegundoPlano } from "@/lib/sentimientoComentarios";
import { hoyColombia } from "@/lib/hoyColombia";

// Módulo de Bienestar: actividades del cronograma (ActividadBienestar). Cada compra se le puede asociar desde el
// formulario de Compras (Record.actividadId, ver lib/records.js#requireActividadDelCatalogo); aquí se suma ese gasto
// contra el presupuesto de la actividad. Leer es para cualquier usuario autenticado (el formulario de compras necesita
// la lista); crear, editar y eliminar requiere editBienestar (ver lib/permissions.js).

export const LINEAS = ["Bienestar", "Fundación"];
// Ciclo de una actividad: creada (puede no tener fecha) → programada → ejecutada → cerrada. Las tres últimas exigen
// fecha. Cerrar no es un estado que se elija: es una acción aparte, solo desde ejecutada y con calificación. Cerrada no se
// modifica más (actividad, participantes, inventario, fotos, formulario ni compras asociadas).
export const ESTADOS = ["creada", "programada", "ejecutada", "cerrada"];
export const ESTADO_LABELS = { creada: "Creada", programada: "Programada", ejecutada: "Ejecutada", cerrada: "Cerrada" };

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function toClientActividad(a, gasto = null) {
  const gastado = gasto?.gastado ?? 0;
  return {
    id: a.id,
    nombre: a.nombre,
    fecha: a.fecha,
    fechaFin: a.fechaFin || null,
    puntajeNova: a.analisisNova?.puntaje ?? null,
    linea: a.linea,
    estado: a.estado,
    descripcion: a.descripcion,
    responsableUserId: a.responsableUserId,
    responsableNombre: a.responsableNombre,
    presupuesto: a.presupuesto,
    inscritos: a.inscritos,
    asistentes: a.asistentes,
    enCronograma: a.enCronograma,
    aplicaParticipantes: a.aplicaParticipantes !== false,
    observaciones: a.observaciones,
    createdAt: a.createdAt,
    creadoPorNombre: a.creadoPorNombre,
    updatedAt: a.updatedAt,
    calificacion: a.calificacion,
    comentarioCierre: a.comentarioCierre,
    cerradaAt: a.cerradaAt,
    cerradaPorNombre: a.cerradaPorNombre,
    formularioAbierto: a.formularioAbierto,
    formularioToken: a.formularioToken,
    formularioCampos: (() => { try { return a.formularioCampos ? JSON.parse(a.formularioCampos) : []; } catch { return []; } })(),
    // Gasto de las compras asociadas (valor con IVA, en pesos) y cuánto del presupuesto consume.
    compras: gasto?.compras ?? 0,
    gastado,
    pctPresupuesto: a.presupuesto ? gastado / a.presupuesto : null,
  };
}

async function gastoPorActividad(ids) {
  if (!ids.length) return new Map();
  const grupos = await prisma.record.groupBy({
    by: ["actividadId"],
    where: { actividadId: { in: ids } },
    _sum: { valorConIva: true },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.actividadId, { gastado: g._sum.valorConIva || 0, compras: g._count._all }]));
}

// Las del año (por su fecha) más las que aún no tienen fecha; sin año, todas. Con línea, solo las de esa línea
// (Bienestar y Fundación se manejan muy aparte: cada una tiene su menú, su resumen y su cronograma).
export async function listActividades({ anio, linea } = {}) {
  // Las que aún no tienen fecha (por planear) son del plan en curso: solo entran en el año actual, no en todos.
  const conSinFecha = Number(anio) === Number(hoyColombia().slice(0, 4));
  const where = anio ? { OR: [{ fecha: { startsWith: `${Number(anio)}-` } }, ...(conSinFecha ? [{ fecha: null }] : [])] } : {};
  if (linea) {
    if (!LINEAS.includes(linea)) throw badRequest(`Línea inválida. Opciones: ${LINEAS.join(", ")}.`);
    where.linea = linea;
  }
  const rows = await prisma.actividadBienestar.findMany({ where, orderBy: [{ fecha: "asc" }, { nombre: "asc" }], include: { analisisNova: { select: { puntaje: true } } } });
  const gastos = await gastoPorActividad(rows.map((r) => r.id));
  return rows.map((r) => sinConteosSiNoAplica(toClientActividad(r, gastos.get(r.id))));
}

// Una actividad sin participantes no muestra ni suma inscritos o asistentes. Lo guardado se conserva por si se vuelve a activar.
function sinConteosSiNoAplica(a) {
  return a.aplicaParticipantes ? a : { ...a, inscritos: null, asistentes: null };
}

export function toClientAnalisisActividad(r) {
  if (!r) return null;
  return {
    id: r.id, actividadId: r.actividadId, puntaje: r.puntaje, titulo: r.titulo, resumen: r.resumen,
    puntos: Array.isArray(r.puntos) ? r.puntos : [], origen: r.origen, generadoAt: r.updatedAt, creadoPorNombre: r.creadoPorNombre,
  };
}

// El detalle trae las compras asociadas (lo justo para mostrarlas; el registro completo vive en Compras), el resumen
// de participación (por área, motivos de inasistencia, calificación promedio) y el inventario con su resumen: todo lo
// que muestra la ficha de la actividad.
export async function getActividad(id) {
  const row = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) } });
  if (!row) throw badRequest("Actividad no encontrada.", 404);
  const compras = await prisma.record.findMany({
    where: { actividadId: row.id },
    orderBy: [{ fechaSolicitud: "asc" }, { localSeq: "asc" }],
    select: { id: true, localSeq: true, fechaSolicitud: true, descripcion: true, proveedor: true, valorConIva: true, estadoLegalizacion: true, radicado: true },
  });
  const gastado = compras.reduce((s, c) => s + (c.valorConIva || 0), 0);
  const [notasEquipo, deParticipantes] = await Promise.all([
    prisma.observacionActividad.count({ where: { actividadId: row.id } }),
    row.aplicaParticipantes ? prisma.participanteActividad.count({ where: { actividadId: row.id, OR: [{ calificacion: { not: null } }, { observacion: { not: null } }] } }) : 0,
  ]);
  const [participacion, inventario, fotos, analisisNova] = await Promise.all([resumenParticipacion(row.id), listInventario(row.id), prisma.fotoActividad.count({ where: { actividadId: row.id } }), prisma.analisisActividad.findUnique({ where: { actividadId: row.id } })]);
  return {
    ...sinConteosSiNoAplica(toClientActividad(row, { gastado, compras: compras.length })),
    detalleCompras: compras,
    participacion,
    totalObservaciones: notasEquipo + deParticipantes + (row.observaciones ? 1 : 0) + (row.comentarioCierre ? 1 : 0),
    fotos,
    analisisNova: toClientAnalisisActividad(analisisNova),
    inventario: { items: inventario, resumen: resumenInventario(inventario) },
  };
}

function texto(v, max) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function enteroONulo(v, etiqueta) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw badRequest(`${etiqueta} debe ser un número entero, cero o mayor.`);
  return n;
}

function fechaONula(v) {
  if (v === "" || v === null || v === undefined) return null;
  const s = String(v).slice(0, 10);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw badRequest("La fecha debe ser una fecha válida (aaaa-mm-dd).");
  }
  return s;
}

// El responsable sale del maestro "Responsables de actividades" (Maestros › Bienestar). Quien ya era responsable se
// conserva aunque hayan quitado a esa persona del maestro: editar otra cosa de la actividad no debe obligar a cambiarlo.
async function responsableDe(userId, actualId = null) {
  if (!userId) return { responsableUserId: null, responsableNombre: null };
  if (String(userId) !== actualId) {
    const delMaestro = await prisma.maestro.findFirst({ where: { tipo: "responsableBienestar", userId: String(userId), activo: true }, select: { id: true } });
    if (!delMaestro) throw badRequest("El responsable debe estar en Maestros de Bienestar › Responsables de actividades.");
  }
  const u = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, nombre: true, activo: true } });
  if (!u || !u.activo) throw badRequest("El responsable debe ser un usuario activo de la aplicación.");
  return { responsableUserId: u.id, responsableNombre: u.nombre };
}

// Valida y normaliza lo que llega del cliente. En una edición solo se tocan los campos enviados.
async function leerDatos(body, { parcial = false, responsableActual = null } = {}) {
  const data = {};
  const viene = (k) => !parcial || k in body;
  if (viene("nombre")) {
    data.nombre = texto(body.nombre, 200);
    if (!data.nombre) throw badRequest("El nombre de la actividad es obligatorio.");
  }
  if (viene("fecha")) data.fecha = fechaONula(body.fecha);
  if (viene("fechaFin")) data.fechaFin = fechaONula(body.fechaFin);
  if (viene("linea")) {
    data.linea = body.linea || "Bienestar";
    if (!LINEAS.includes(data.linea)) throw badRequest(`Línea inválida. Opciones: ${LINEAS.join(", ")}.`);
  }
  if (viene("estado")) {
    data.estado = body.estado || "creada";
    if (!ESTADOS.includes(data.estado)) throw badRequest(`Estado inválido. Opciones: ${ESTADOS.join(", ")}.`);
  }
  if (viene("descripcion")) data.descripcion = texto(body.descripcion, 2000);
  if (viene("observaciones")) {
    data.observaciones = texto(body.observaciones, 4000);
    data.sentimientoObservaciones = null; // Nova lo vuelve a leer (lib/sentimientoComentarios.js)
  }
  if (viene("presupuesto")) {
    if (body.presupuesto === "" || body.presupuesto === null || body.presupuesto === undefined) data.presupuesto = null;
    else {
      const n = Number(body.presupuesto);
      if (!Number.isFinite(n) || n < 0) throw badRequest("El presupuesto debe ser un valor en pesos, cero o mayor.");
      data.presupuesto = n;
    }
  }
  if (viene("inscritos")) data.inscritos = enteroONulo(body.inscritos, "Inscritos");
  if (viene("asistentes")) data.asistentes = enteroONulo(body.asistentes, "Asistentes");
  if (viene("enCronograma")) data.enCronograma = body.enCronograma ?? true;
  if (viene("aplicaParticipantes")) {
    data.aplicaParticipantes = body.aplicaParticipantes !== false;
    if (!data.aplicaParticipantes) data.formularioAbierto = false; // sin participantes, no hay inscripción pública
  }
  if (viene("responsableUserId")) Object.assign(data, await responsableDe(body.responsableUserId, responsableActual));
  return data;
}

function exigirFechaSegunEstado(estado, fecha) {
  if (estado !== "creada" && !fecha) throw badRequest(`Una actividad ${ESTADO_LABELS[estado].toLowerCase()} debe tener fecha.`);
}

// Una actividad que aún no llega no puede quedar ejecutada ni cerrada (evita registrar asistencias y cierres por error).
function exigirQueYaPaso(estado, fecha) {
  if ((estado === "ejecutada" || estado === "cerrada") && fecha && fecha > hoyColombia()) {
    throw badRequest(`La actividad es del ${fecha} y esa fecha aún no llega: no se puede marcar como ${ESTADO_LABELS[estado].toLowerCase()}.`);
  }
}

// Actividades de varios días: fechaFin va con una fecha de inicio y nunca antes de ella; igual a la de inicio = un día.
function normalizarFechaFin(fecha, fechaFin) {
  if (!fechaFin) return null;
  if (!fecha) throw badRequest("Para poner una fecha de fin, primero pon la fecha de inicio.");
  if (fechaFin < fecha) throw badRequest("La fecha de fin no puede ser anterior a la de inicio.");
  return fechaFin === fecha ? null : fechaFin;
}

export async function createActividad(body, actor) {
  const data = await leerDatos(body || {});
  exigirFechaSegunEstado(data.estado, data.fecha);
  exigirQueYaPaso(data.estado, data.fecha);
  data.fechaFin = normalizarFechaFin(data.fecha, data.fechaFin);
  const row = await prisma.actividadBienestar.create({
    data: { ...data, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
  });
  const cliente = toClientActividad(row);
  logActividadCreate(actor, cliente).catch(() => {});
  if (row.observaciones) clasificarEnSegundoPlano(row.id);
  return cliente;
}

export async function updateActividad(id, body, actor) {
  const before = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) } });
  if (!before) throw badRequest("Actividad no encontrada.", 404);
  if (before.estado === "cerrada") throw badRequest("La actividad está cerrada: ya no se puede modificar.", 409);
  const data = await leerDatos(body || {}, { parcial: true, responsableActual: before.responsableUserId });
  exigirFechaSegunEstado(data.estado ?? before.estado, "fecha" in data ? data.fecha : before.fecha);
  if ("estado" in data || "fecha" in data) exigirQueYaPaso(data.estado ?? before.estado, "fecha" in data ? data.fecha : before.fecha);
  if ("fecha" in data || "fechaFin" in data) {
    data.fechaFin = normalizarFechaFin("fecha" in data ? data.fecha : before.fecha, "fechaFin" in data ? data.fechaFin : before.fechaFin);
  }
  // Cerrar exige calificar la actividad (1 a 5); queda quién y cuándo la cerró. Reabrirla conserva la calificación.
  if (data.estado === "cerrada" && before.estado !== "cerrada") {
    if (before.estado !== "ejecutada") throw badRequest("Solo se puede cerrar una actividad que ya se ejecutó.");
    const n = Number(body?.calificacion);
    if (!(Number.isInteger(n) && n >= 1 && n <= 5)) throw badRequest("Para cerrar la actividad, califícala de 1 a 5.");
    Object.assign(data, {
      calificacion: n,
      comentarioCierre: texto(body?.comentarioCierre, 2000),
      sentimientoCierre: null,
      cerradaAt: new Date(),
      cerradaPorUserId: actor?.id || null,
      cerradaPorNombre: actor?.nombre || null,
      formularioAbierto: false,
    });
  }
  const row = await prisma.actividadBienestar.update({ where: { id: before.id }, data });
  if (data.estado === "cerrada" && before.estado !== "cerrada") {
    // Ya no recibe compras: lo que seguía sin atender se cancela y queda en Auditoría.
    const r = await prisma.solicitudCompra.updateMany({ where: { actividadId: row.id, estado: "pendiente" }, data: { estado: "cancelada", atendidaAt: new Date(), atendidaPorUserId: actor?.id || null, atendidaPorNombre: actor?.nombre || null } });
    if (r.count) logCompraDeActividad(actor, row, `Al cerrarla se cancelaron ${r.count} solicitud(es) de compra sin atender`).catch(() => {});
  }
  if ((data.sentimientoObservaciones === null && row.observaciones) || (data.sentimientoCierre === null && row.comentarioCierre)) clasificarEnSegundoPlano(row.id);
  const gastos = await gastoPorActividad([row.id]);
  const after = toClientActividad(row, gastos.get(row.id));
  // Si cambió el nombre, las compras asociadas lo muestran al instante (se resuelve por id al listar, ver
  // lib/records.js#hydrateConDatosActuales); el texto guardado en cada compra queda como foto histórica.
  logActividadUpdate(actor, toClientActividad(before), after).catch(() => {});
  return after;
}

export async function deleteActividad(id, actor) {
  const before = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) } });
  if (!before) throw badRequest("Actividad no encontrada.", 404);
  if (before.estado === "cerrada") throw badRequest("La actividad está cerrada: ya no se puede eliminar.", 409);
  const compras = await prisma.record.count({ where: { actividadId: before.id } });
  if (compras) {
    throw badRequest(`La actividad tiene ${compras} compra(s) asociada(s). Desasócialas desde Registros antes de eliminarla, o ciérrala.`, 409);
  }
  await prisma.actividadBienestar.delete({ where: { id: before.id } });
  logActividadDelete(actor, toClientActividad(before)).catch(() => {});
}

// ---------- Resumen (dashboard) ----------
// Cruza la participación de las actividades con su costo, por línea (Bienestar o Fundación). Regla: en Bienestar solo se
// muestran valores de compras ASOCIADAS a una actividad de la línea; lo que no se ha asociado no cuenta en ninguna cifra
// (tampoco para Nova). Cada compra cae en el mes de su actividad, no en el de su fecha de solicitud.

// mes (1-12, opcional): vista Mensual, como el Dashboard de compras — KPIs, participación, categorías y costos solo
// de ese mes (actividades por su fecha, compras por su fecha de solicitud); porMes sigue siendo el año completo.
// Los 5 comentarios más a favor y los 5 más en contra del período, según la manito de Nova (lib/sentimientoComentarios.js).
// Sin el nombre de quien lo escribió. Las actividades sin participantes solo aportan las notas del equipo.
export async function comentariosDestacados(actividades) {
  if (!actividades.length) return { positivos: [], negativos: [], totalPositivos: 0, totalNegativos: 0 };
  const deActividad = new Map(actividades.map((a) => [a.id, a]));
  const conParticipantes = actividades.filter((a) => a.aplicaParticipantes).map((a) => a.id);
  const tonos = { in: ["positivo", "negativo"] };
  const [participantes, notas] = await Promise.all([
    prisma.participanteActividad.findMany({ where: { actividadId: { in: conParticipantes }, sentimiento: tonos, observacion: { not: null } }, select: { id: true, actividadId: true, observacion: true, calificacion: true, sentimiento: true } }),
    prisma.observacionActividad.findMany({ where: { actividadId: { in: [...deActividad.keys()] }, sentimiento: tonos }, select: { id: true, actividadId: true, texto: true, sentimiento: true } }),
  ]);
  const todos = [
    ...participantes.map((p) => ({ clave: `p${p.id}`, actividadId: p.actividadId, texto: p.observacion, calificacion: p.calificacion, sentimiento: p.sentimiento })),
    ...notas.map((n) => ({ clave: `n${n.id}`, actividadId: n.actividadId, texto: n.texto, calificacion: null, sentimiento: n.sentimiento })),
  ].map((c) => {
    const a = deActividad.get(c.actividadId);
    return { ...c, texto: c.texto.slice(0, 500), actividad: a.nombre, fecha: a.fecha, fechaFin: a.fechaFin, estado: a.estado, linea: a.linea };
  });
  // Más a favor: la mejor calificación y, a igual, el comentario más completo; más en contra: la peor calificación.
  const largo = (c) => Math.min(c.texto.length, 300);
  // Un "a favor" con 1-2 estrellas o un "en contra" con 4-5 se contradicen: no van en el destacado.
  const positivos = todos.filter((c) => c.sentimiento === "positivo" && !(c.calificacion != null && c.calificacion <= 2));
  const negativos = todos.filter((c) => c.sentimiento === "negativo" && !(c.calificacion != null && c.calificacion >= 4));
  // El mismo comentario (copiado en varias encuestas) sale una sola vez.
  const unicos = (lista) => {
    const vistos = new Set();
    return lista.filter((c) => {
      const k = c.texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  };
  return {
    positivos: unicos([...positivos].sort((a, b) => (b.calificacion ?? 0) - (a.calificacion ?? 0) || largo(b) - largo(a))).slice(0, 5),
    negativos: unicos([...negativos].sort((a, b) => (a.calificacion ?? 6) - (b.calificacion ?? 6) || largo(b) - largo(a))).slice(0, 5),
    totalPositivos: positivos.length,
    totalNegativos: negativos.length,
  };
}

// Compras del área Bienestar sin actividad asociada: no suman en el módulo (solo cuenta lo asociado), pero se muestran
// aparte para que se vea cuánto gasto del área falta por asociar. prefijo: "2026-" o "2026-06".
export const AREAS_BIENESTAR = ["Bienestar"];
const filtroSinActividad = (prefijo) => ({
  actividadId: null,
  fechaSolicitud: { startsWith: prefijo },
  estado: { not: "Anulado" },
  OR: AREAS_BIENESTAR.map((a) => ({ area: { equals: a, mode: "insensitive" } })),
});

export async function resumenComprasSinActividad(prefijo) {
  const r = await prisma.record.aggregate({ where: filtroSinActividad(prefijo), _count: true, _sum: { valorConIva: true } });
  return { compras: r._count, valor: r._sum.valorConIva || 0, areas: AREAS_BIENESTAR };
}

export async function listComprasSinActividad({ anio, mes } = {}) {
  const y = Number(anio) || Number(hoyColombia().slice(0, 4));
  const m = Number(mes) >= 1 && Number(mes) <= 12 ? Number(mes) : null;
  const rows = await prisma.record.findMany({
    where: filtroSinActividad(m ? `${y}-${String(m).padStart(2, "0")}` : `${y}-`),
    select: { id: true, localSeq: true, fechaSolicitud: true, descripcion: true, proveedor: true, valorConIva: true, categoria: true, area: true },
    orderBy: [{ fechaSolicitud: "desc" }, { localSeq: "desc" }],
  });
  return rows;
}

export async function resumenBienestar(anio, linea = "Bienestar", mes = null) {
  const y = Number(anio) || new Date().getFullYear();
  const m = Number(mes) >= 1 && Number(mes) <= 12 ? Number(mes) : null;
  const prefijo = `${y}-`;
  const prefijoPeriodo = m ? `${y}-${String(m).padStart(2, "0")}` : prefijo;
  if (!LINEAS.includes(linea)) throw badRequest(`Línea inválida. Opciones: ${LINEAS.join(", ")}.`);
  let actividades = await listActividades({ anio: y, linea });
  const comprasAnio = await prisma.record.findMany({
    where: { actividadId: { not: null }, actividadRef: { fecha: { startsWith: prefijo }, linea } },
    select: { valorConIva: true, categoria: true, actividadRef: { select: { fecha: true } } },
  });
  const actividadesAnio = actividades;
  // Desde aquí, todo es del período elegido (el mes en la vista Mensual); porMes usa el año completo.
  const comprasArea = m ? comprasAnio.filter((r) => r.actividadRef.fecha.startsWith(prefijoPeriodo)) : comprasAnio;
  if (m) actividades = actividadesAnio.filter((a) => a.fecha?.startsWith(prefijoPeriodo));

  const conFecha = actividades.filter((a) => a.fecha);
  const sum = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const mesDe = (fecha) => Number(String(fecha).slice(5, 7)) - 1;

  const porMes = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, asistentes: 0, actividades: 0, gastoArea: 0, gastoActividades: 0 }));
  for (const a of actividadesAnio.filter((x) => x.fecha)) {
    porMes[mesDe(a.fecha)].actividades++;
    porMes[mesDe(a.fecha)].asistentes += a.asistentes || 0;
  }
  for (const r of comprasAnio) {
    porMes[mesDe(r.actividadRef.fecha)].gastoArea += r.valorConIva || 0;
    porMes[mesDe(r.actividadRef.fecha)].gastoActividades += r.valorConIva || 0;
  }

  const categorias = new Map();
  for (const r of comprasArea) categorias.set(r.categoria || "Sin categoría", (categorias.get(r.categoria || "Sin categoría") || 0) + (r.valorConIva || 0));

  const conAsistencia = actividades.filter((a) => a.inscritos && a.asistentes != null);

  // Participación por área y motivos de inasistencia, de los participantes registrados en las actividades de la línea.
  const participantes = await prisma.participanteActividad.findMany({
    where: { actividadId: { in: actividades.filter((a) => a.aplicaParticipantes).map((a) => a.id) } },
    select: { area: true, inscrito: true, asistio: true, motivoInasistencia: true },
  });
  const porArea = new Map();
  const motivos = new Map();
  for (const p of participantes) {
    const k = p.area || "Sin área";
    const a = porArea.get(k) || { area: k, inscritos: 0, asistieron: 0, noAsistieron: 0 };
    if (p.inscrito) a.inscritos++;
    if (p.asistio === true) a.asistieron++;
    if (p.asistio === false) {
      a.noAsistieron++;
      const m = p.motivoInasistencia || "Sin motivo registrado";
      motivos.set(m, (motivos.get(m) || 0) + 1);
    }
    porArea.set(k, a);
  }
  const asistentes = sum(actividades, (a) => a.asistentes);
  const gastoArea = sum(comprasArea, (r) => r.valorConIva);
  const asistentesConCompras = sum(actividades.filter((a) => a.gastado > 0), (a) => a.asistentes);
  const hoy = new Date().toISOString().slice(0, 10);

  return {
    anio: y,
    mes: m,
    linea,
    // Vista Mensual: cada actividad del mes con su gasto y sus asistentes (la gráfica de barras + línea).
    porActividad: conFecha.map((a) => ({ id: a.id, nombre: a.nombre, fecha: a.fecha, fechaFin: a.fechaFin, estado: a.estado, aplicaParticipantes: a.aplicaParticipantes, gastado: a.gastado || 0, asistentes: a.asistentes || 0, inscritos: a.inscritos || 0, presupuesto: a.presupuesto || 0 })),
    kpis: {
      actividades: actividades.length,
      porEstado: Object.fromEntries(ESTADOS.map((e) => [e, actividades.filter((a) => a.estado === e).length])),
      asistentes,
      asistencia: sum(conAsistencia, (a) => a.inscritos) ? sum(conAsistencia, (a) => a.asistentes) / sum(conAsistencia, (a) => a.inscritos) : null,
      presupuestoAsignado: sum(actividades, (a) => a.presupuesto),
      gastoActividades: sum(actividades, (a) => a.gastado),
      gastoSinPresupuesto: sum(actividades.filter((a) => !a.presupuesto), (a) => a.gastado),
      gastoArea,
      comprasArea: comprasArea.length,
      // Solo con los asistentes de las actividades que tienen compras: los demás no tienen costo conocido.
      costoPorAsistente: asistentesConCompras ? gastoArea / asistentesConCompras : null,
    },
    porMes,
    categorias: [...categorias].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor),
    participacion: {
      registrados: participantes.length,
      inscritos: participantes.filter((p) => p.inscrito).length,
      asistieron: participantes.filter((p) => p.asistio === true).length,
      noAsistieron: participantes.filter((p) => p.asistio === false).length,
      sinRegistrar: participantes.filter((p) => p.inscrito && p.asistio == null).length,
      porArea: [...porArea.values()].sort((a, b) => b.inscritos - a.inscritos),
      motivos: [...motivos].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n),
    },
    presupuestoVsGasto: actividades
      .filter((a) => a.presupuesto || a.gastado)
      .map((a) => ({ id: a.id, nombre: a.nombre, fecha: a.fecha, presupuesto: a.presupuesto || 0, gastado: a.gastado || 0 }))
      .sort((a, b) => b.gastado + b.presupuesto - (a.gastado + a.presupuesto)),
    costoPorActividad: actividades
      .filter((a) => a.gastado > 0 && a.asistentes)
      .map((a) => ({ id: a.id, nombre: a.nombre, fecha: a.fecha, asistentes: a.asistentes, gastado: a.gastado, costoPorAsistente: a.gastado / a.asistentes, compras: a.compras }))
      .sort((a, b) => b.costoPorAsistente - a.costoPorAsistente),
    proximas: conFecha
      .filter((a) => (a.fechaFin || a.fecha) >= hoy && (a.estado === "creada" || a.estado === "programada"))
      .slice(0, 8),
    comentariosDestacados: await comentariosDestacados(actividades),
    comprasSinActividad: await resumenComprasSinActividad(prefijoPeriodo),
  };
}
