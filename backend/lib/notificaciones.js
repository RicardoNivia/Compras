import { prisma } from "@/lib/prisma";
import { FRECUENCIAS, esFechaDeEnvio, esHabil, describirProgramacion, formatoHora, ymd } from "@/lib/reportSchedule";
import {
  LIMITES, FUENTES, CONSULTAS, PERIODOS, CAMPOS_FECHA, PRESETS_COMPRAS, PRESETS_PROVEEDORES,
  CONDICIONES, SI_FESTIVO, CANALES, ESTADOS, EVENTOS, AGRUPACIONES, ESTADOS_CICLO, NIVELES_PRESUPUESTO, preguntasFaltantes,
} from "@/lib/notificacionesCatalogo";
import { puedeVerFuente, puedeUsarNotificaciones, puedeGestionar, mensajeSinPermiso } from "@/lib/notificacionesPermisos";
import {
  logNotificacionCreate, logNotificacionUpdate, logNotificacionDelete, logNotificacionEstado, logNotificacionSuscripcion,
} from "@/lib/audit";
import { ROLES } from "@/lib/roles";

// Notificaciones configurables: CRUD, validación, programación, bandeja e historial (ver docs/notificaciones-diseno.md).
// La ejecución (consultar, armar el mensaje y entregar) vive en lib/notificacionesMotor.js.

const err = (status, message) => Object.assign(new Error(message), { status });
const parse = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const texto = (v, max) => (v == null ? "" : String(v).trim().slice(0, max));

// ---------- Programación ----------

// "correr" = siguiente día hábil (saltarFestivos), "enviar" = ese mismo día, "omitir" = no se envía ese período.
function reglaAgenda(n) {
  return { ...n, saltarFestivos: n.siFestivo !== "enviar" };
}

export function esDiaDeEnvio(n, d) {
  if (n.siFestivo === "omitir" && n.frecuencia !== "diaria") {
    return esFechaDeEnvio({ ...n, saltarFestivos: false }, d) && esHabil(d, { ...n, saltarFestivos: true });
  }
  return esFechaDeEnvio(reglaAgenda(n), d);
}

export function proximasFechas(n, cantidad = 5, desde = new Date()) {
  if (!n.frecuencia || !n.hora) return [];
  const [h, mi] = String(n.hora).split(":").map(Number);
  const out = [];
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  if (desde.getHours() * 60 + desde.getMinutes() >= h * 60 + mi) cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 800 && out.length < cantidad; i++) {
    if (esDiaDeEnvio(n, cursor)) out.push({ fecha: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), h, mi).toISOString(), dia: ymd(cursor) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function describirCuando(n) {
  if (n.disparador === "evento") {
    const accion = EVENTOS[n.evento]?.accion || "ocurre el evento";
    if (n.agrupacion === "cada_15_min") return `Cada 15 min, si ${accion}`;
    if (n.agrupacion === "resumen_diario") return `Resumen diario · ${formatoHora(n.hora || "18:00")} · si ${accion}`;
    return `Al instante, cuando ${accion}`;
  }
  if (!n.frecuencia) return "Sin programar";
  const base = describirProgramacion(reglaAgenda({ ...n, hora: n.hora || "08:00" }));
  if (n.frecuencia === "diaria") return n.siFestivo === "enviar" ? `${base} (también festivos)` : base;
  const fest = { correr: "si es festivo, el siguiente día hábil", enviar: "aunque sea festivo", omitir: "si es festivo, no se envía" }[n.siFestivo];
  return fest ? `${base} · ${fest}` : base;
}

// ---------- Validación ----------

function validarParametros(consulta, p = {}) {
  const def = CONSULTAS[consulta];
  const out = {};
  for (const k of def.parametros) {
    const v = p[k];
    if (v == null || v === "") continue;
    switch (k) {
      case "periodo":
        if (!PERIODOS[v]) throw err(400, `Período no válido: ${v}`);
        out.periodo = v; break;
      case "dias": {
        const n = parseInt(v, 10);
        if (!(n >= 1 && n <= 366)) throw err(400, "Los días deben estar entre 1 y 366.");
        out.dias = n; break;
      }
      case "campoFecha":
        if (!CAMPOS_FECHA[v]) throw err(400, "Campo de fecha no válido.");
        out.campoFecha = v; break;
      case "preset": {
        const presets = def.fuente === "proveedores" ? PRESETS_PROVEEDORES : PRESETS_COMPRAS;
        if (!presets[v]) throw err(400, `Situación no válida: ${v}`);
        out.preset = v; break;
      }
      case "puntajeMax": {
        const n = parseInt(v, 10);
        if (!(n >= 1 && n <= 5)) throw err(400, "El puntaje debe estar entre 1 y 5.");
        out.puntajeMax = n; break;
      }
      case "umbral": {
        const n = parseInt(v, 10);
        if (!(n >= 1 && n <= 500)) throw err(400, "El porcentaje debe estar entre 1 y 500.");
        out.umbral = n; break;
      }
      default: // area, categoria, estado: texto exacto del catálogo, comparado sin tildes ni mayúsculas
        if (!esSinFiltro(v)) out[k] = texto(v, 100);
    }
  }
  if (consulta === "lista_compras" && !out.preset) throw err(400, "Indica qué compras quieres ver.");
  if (consulta === "proveedores_ciclo" && !out.preset) out.preset = "desactualizados";
  if (out.periodo === "ultimos_n_dias" && !out.dias) out.dias = 7;
  return out;
}

// Normaliza y valida lo que llega del cliente (o de Nova). No consulta permisos (ver validarPermisos).
// "Todas", "todos los estados", "cualquiera"… en un filtro de texto significan "sin filtro" (Nova o la persona lo
// escriben así). Guardarlo literal haría que nada coincida y la notificación nunca saldría.
export function esSinFiltro(v) {
  return /^\s*(tod[oa]s?|cualquier[ae]?|all|ninguno|-+)(\s+(las|los|el|la)\b.*)?\s*$/i.test(String(v ?? ""));
}

function validarFiltrosEvento(ev, p = {}) {
  const out = {};
  for (const k of ev.filtros) {
    const v = p[k];
    if (v == null || v === "") continue;
    if (k === "puntajeMax" || k === "estrellasMax") {
      const n = parseInt(v, 10);
      if (!(n >= 1 && n <= 5)) throw err(400, "El puntaje debe estar entre 1 y 5.");
      out[k] = n;
    } else if (k === "soloFueraDePlazo") {
      if (v === true || v === "true") out[k] = true;
    } else if (k === "nivel") {
      if (!NIVELES_PRESUPUESTO[v]) throw err(400, "Nivel de presupuesto no válido.");
      out[k] = v;
    } else if (k === "soloExcedido") {
      if (v === true || v === "true") out[k] = true;
    } else if (k === "estadoCiclo") {
      if (!ESTADOS_CICLO[v]) throw err(400, "Estado del ciclo no válido.");
      out[k] = v;
    } else if (!esSinFiltro(v)) {
      out[k] = texto(v, 100);
    }
  }
  return out;
}

export function normalizarRegla(input) {
  const disparador = input.disparador === "evento" ? "evento" : "programado";
  let consulta, def, parametros, evento = null, agrupacion = null;
  if (disparador === "evento") {
    evento = String(input.evento || "");
    const ev = EVENTOS[evento];
    if (!ev) throw err(400, "Elige qué evento dispara la notificación.");
    consulta = "evento";
    def = { fuente: ev.fuente, alcances: ev.fuente === "compras" ? ["general", "personal"] : ["general"] };
    parametros = validarFiltrosEvento(ev, input.parametros || {});
    agrupacion = AGRUPACIONES[input.agrupacion] ? input.agrupacion : null;
  } else {
    consulta = String(input.consulta || "");
    def = CONSULTAS[consulta];
    if (!def) throw err(400, "Elige qué datos quieres recibir.");
    parametros = validarParametros(consulta, input.parametros || {});
  }
  const regla = {
    nombre: texto(input.nombre, 120),
    pedido: texto(input.pedido, 2000),
    aclaraciones: Array.isArray(input.aclaraciones) ? input.aclaraciones.slice(0, 20).map((a) => ({ pregunta: texto(a.pregunta, 300), respuesta: texto(a.respuesta, 300) })) : [],
    disparador,
    evento,
    agrupacion,
    fuente: def.fuente,
    consulta,
    parametros,
    alcance: input.alcance || null,
    condicion: input.condicion || null,
    umbral: input.umbral != null && input.umbral !== "" ? parseInt(input.umbral, 10) : null,
    frecuencia: input.frecuencia || null,
    diaSemana: input.diaSemana != null && input.diaSemana !== "" ? parseInt(input.diaSemana, 10) : null,
    diaMes: input.diaMes != null && input.diaMes !== "" ? parseInt(input.diaMes, 10) : null,
    ordinal: input.ordinal != null && input.ordinal !== "" ? parseInt(input.ordinal, 10) : null,
    fechaUnica: input.fechaUnica || null,
    hora: input.hora || null,
    siFestivo: input.siFestivo || null,
    sabadoHabil: !!input.sabadoHabil,
    domingoHabil: !!input.domingoHabil,
    titulo: texto(input.titulo, 150),
    plantilla: texto(input.plantilla, 1500),
    canales: Array.isArray(input.canales) ? [...new Set(input.canales.map(String))] : ["app"],
    destinatarios: Array.isArray(input.destinatarios) ? [...new Set(input.destinatarios.map((d) => String(d?.userId || d?.id || d)))] : [],
    estado: input.estado === "borrador" ? "borrador" : "activa",
  };

  if (!regla.nombre) throw err(400, "Ponle un nombre a la notificación.");
  // Por evento: sale cuando ocurre. Solo el resumen diario tiene hora (cada día hábil); nunca se pregunta festivo.
  if (disparador === "evento") {
    Object.assign(regla, { frecuencia: agrupacion === "resumen_diario" ? "diaria" : null, diaSemana: null, diaMes: null, ordinal: null, fechaUnica: null, siFestivo: "correr", condicion: "si_hay_resultados", umbral: null });
    if (agrupacion !== "resumen_diario") regla.hora = null;
  }
  if (regla.alcance && !def.alcances.includes(regla.alcance)) throw err(400, "Esta consulta no admite ese alcance.");
  if (!regla.alcance && def.alcances.length === 1) regla.alcance = def.alcances[0];
  if (regla.condicion && !CONDICIONES[regla.condicion]) throw err(400, "Condición de envío no válida.");
  if (regla.condicion === "umbral" && !(regla.umbral >= 1)) throw err(400, "Indica a partir de cuántos resultados se envía.");
  if (regla.frecuencia && !FRECUENCIAS.includes(regla.frecuencia)) throw err(400, "Frecuencia no válida.");
  if (regla.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(regla.hora)) throw err(400, "La hora debe tener el formato HH:mm.");
  if (regla.siFestivo && !SI_FESTIVO[regla.siFestivo]) throw err(400, "Opción de festivo no válida.");
  if (["semanal", "mensual_semana"].includes(regla.frecuencia) && !(regla.diaSemana >= 0 && regla.diaSemana <= 6)) throw err(400, "Indica el día de la semana.");
  if (regla.frecuencia === "mensual" && !(regla.diaMes >= 1 && regla.diaMes <= 31)) throw err(400, "Indica el día del mes (1 a 31).");
  if (regla.frecuencia === "mensual_semana" && ![1, 2, 3, 4, -1].includes(regla.ordinal)) throw err(400, "Indica cuál semana del mes.");
  if (regla.frecuencia === "unica") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(regla.fechaUnica || "")) throw err(400, "Indica la fecha del envío único.");
    if (regla.fechaUnica < ymd(new Date())) throw err(400, "La fecha del envío único ya pasó.");
  }
  if (regla.canales.includes("correo")) throw err(400, "El correo está deshabilitado por ahora: usa la app o Teams.");
  if (regla.canales.some((c) => !CANALES[c])) throw err(400, "Canal no válido.");
  if (!regla.canales.includes("app")) regla.canales.unshift("app"); // la bandeja de la app siempre recibe
  if (!regla.titulo) regla.titulo = regla.nombre;
  if (!regla.plantilla) throw err(400, "Escribe el mensaje de la notificación.");
  if (regla.destinatarios.length === 0) throw err(400, "Elige al menos un destinatario.");
  if (regla.destinatarios.length > LIMITES.maxDestinatarios) throw err(400, `Máximo ${LIMITES.maxDestinatarios} destinatarios por notificación.`);

  if (regla.estado === "activa") {
    if (disparador === "programado" && !regla.frecuencia) throw err(400, "Indica cuándo se envía.");
    const faltan = preguntasFaltantes(regla);
    if (faltan.length) throw err(400, `Falta definir: ${faltan.map((f) => f.texto).join(" ")}`);
  }
  // Defaults seguros para borradores incompletos (las columnas no admiten null).
  regla.alcance ||= def.alcances[0];
  regla.condicion ||= "si_hay_resultados";
  regla.siFestivo ||= "correr";
  return regla;
}

// Propietario y destinatarios deben poder ver la fuente. Devuelve los usuarios destinatarios.
async function validarPermisos(regla, propietario) {
  if (!(await puedeVerFuente(propietario, regla.fuente))) throw err(403, mensajeSinPermiso(regla.fuente));
  const users = await prisma.user.findMany({ where: { id: { in: regla.destinatarios } }, select: { id: true, nombre: true, email: true, role: true, activo: true } });
  if (users.length !== regla.destinatarios.length) throw err(400, "Algún destinatario ya no existe.");
  for (const u of users) {
    if (!u.activo) throw err(400, `${u.nombre} está inactivo y no puede recibir notificaciones.`);
    if (!(await puedeVerFuente(u, regla.fuente)) || !(await puedeUsarNotificaciones(u))) {
      throw err(403, `Por seguridad no puedes enviarle esta notificación a ${u.nombre}: su rol no tiene acceso a ${FUENTES[regla.fuente].label}.`);
    }
  }
  return users;
}

// Máximo de notificaciones CREADAS por persona (en cualquier estado): se valida al crear.
async function validarLimite(propietarioUserId) {
  const creadas = await prisma.notificacion.count({ where: { propietarioUserId } });
  if (creadas >= LIMITES.maxPorPersona) throw err(400, `Ya tienes ${LIMITES.maxPorPersona} notificaciones, el máximo por persona. Elimina alguna para crear otra.`);
}

// ---------- Forma cliente y auditoría ----------

const INCLUDE = { destinatarios: { orderBy: { userNombre: "asc" } } };

export function toClient(n, user) {
  const parametros = parse(n.parametros, {});
  const canales = parse(n.canales, ["app"]);
  const yo = n.destinatarios?.find((d) => d.userId === user?.id);
  return {
    id: n.id,
    nombre: n.nombre,
    pedido: n.pedido,
    aclaraciones: parse(n.aclaraciones, []),
    disparador: n.disparador,
    evento: n.evento,
    agrupacion: n.agrupacion,
    fuente: n.fuente,
    fuenteLabel: FUENTES[n.fuente]?.label || n.fuente,
    consulta: n.consulta,
    consultaLabel: n.disparador === "evento" ? EVENTOS[n.evento]?.label || n.evento : CONSULTAS[n.consulta]?.label || n.consulta,
    parametros,
    alcance: n.alcance,
    condicion: n.condicion,
    umbral: n.umbral,
    frecuencia: n.frecuencia,
    diaSemana: n.diaSemana,
    diaMes: n.diaMes,
    ordinal: n.ordinal,
    fechaUnica: n.fechaUnica,
    hora: n.hora,
    siFestivo: n.siFestivo,
    sabadoHabil: n.sabadoHabil,
    domingoHabil: n.domingoHabil,
    cuando: describirCuando(n),
    proximas: n.estado === "activa" ? proximasFechas(n, 3) : [],
    titulo: n.titulo,
    plantilla: n.plantilla,
    canales,
    destinatarios: (n.destinatarios || []).map((d) => ({ userId: d.userId, userNombre: d.userNombre, deBaja: d.deBaja, deBajaAt: d.deBajaAt })),
    estado: n.estado,
    estadoLabel: ESTADOS[n.estado] || n.estado,
    motivoPausa: n.motivoPausa,
    pausadaPorNombre: n.pausadaPorNombre,
    pausadaAt: n.pausadaAt,
    propietarioUserId: n.propietarioUserId,
    propietarioNombre: n.propietarioNombre,
    ultimaEjecucionAt: n.ultimaEjecucionAt,
    ultimoResultado: n.ultimoResultado,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    creadoPorNombre: n.creadoPorNombre,
    puedeGestionar: puedeGestionar(user, n),
    soyPropietario: n.propietarioUserId === user?.id,
    soyDestinatario: !!yo,
    miBaja: !!yo?.deBaja,
  };
}

// Snapshot plano y legible para el diff de auditoría.
function paraAuditoria(n) {
  if (!n) return null;
  const parametros = parse(n.parametros, {});
  return {
    id: n.id,
    nombre: n.nombre,
    pedido: n.pedido,
    fuenteLabel: FUENTES[n.fuente]?.label || n.fuente,
    consultaLabel: n.disparador === "evento" ? `Por evento: ${EVENTOS[n.evento]?.label || n.evento} (${AGRUPACIONES[n.agrupacion] || n.agrupacion || "sin agrupar"})` : CONSULTAS[n.consulta]?.label || n.consulta,
    parametrosTexto: Object.entries(parametros).map(([k, v]) => `${k}: ${v}`).join(", "),
    alcance: n.alcance === "personal" ? "Solo lo de cada quien" : "Lo de todos",
    condicion: CONDICIONES[n.condicion] || n.condicion,
    umbral: n.umbral,
    programacion: describirCuando(n),
    siFestivo: SI_FESTIVO[n.siFestivo] || n.siFestivo,
    titulo: n.titulo,
    plantilla: n.plantilla,
    canalesTexto: parse(n.canales, []).map((c) => CANALES[c] || c).join(", "),
    destinatariosTexto: (n.destinatarios || []).map((d) => `${d.userNombre}${d.deBaja ? " (de baja)" : ""}`).join(", "),
    estado: ESTADOS[n.estado] || n.estado,
    motivoPausa: n.motivoPausa,
    propietarioNombre: n.propietarioNombre,
  };
}

function datosDeRegla(regla) {
  return {
    nombre: regla.nombre,
    pedido: regla.pedido,
    aclaraciones: JSON.stringify(regla.aclaraciones || []),
    disparador: regla.disparador,
    evento: regla.evento,
    agrupacion: regla.agrupacion,
    fuente: regla.fuente,
    consulta: regla.consulta,
    parametros: JSON.stringify(regla.parametros),
    alcance: regla.alcance,
    condicion: regla.condicion,
    umbral: regla.condicion === "umbral" ? regla.umbral : null,
    frecuencia: regla.frecuencia,
    diaSemana: regla.diaSemana,
    diaMes: regla.diaMes,
    ordinal: regla.ordinal,
    fechaUnica: regla.fechaUnica,
    hora: regla.hora,
    siFestivo: regla.siFestivo,
    sabadoHabil: regla.sabadoHabil,
    domingoHabil: regla.domingoHabil,
    titulo: regla.titulo,
    plantilla: regla.plantilla,
    canales: JSON.stringify(regla.canales),
    estado: regla.estado,
  };
}

// ---------- Lectura ----------

export async function getNotificacion(id) {
  const n = await prisma.notificacion.findUnique({ where: { id: Number(id) }, include: INCLUDE });
  if (!n) throw err(404, "La notificación no existe.");
  return n;
}

// ver: "mias" (las que creé) | "recibo" (las de otros que me llegan) | "todas" (solo admin)
export async function listNotificaciones(user, { ver = "mias", estado, q, page = 1, size = 25 } = {}) {
  const where = {};
  if (ver === "todas") {
    if (user.role !== ROLES.ADMIN) throw err(403, "Solo un administrador puede ver las notificaciones de todos.");
  } else if (ver === "recibo") {
    where.destinatarios = { some: { userId: user.id } };
    where.propietarioUserId = { not: user.id };
  } else {
    where.propietarioUserId = user.id;
  }
  if (estado && ESTADOS[estado]) where.estado = estado;
  if (q) where.OR = [{ nombre: { contains: String(q).slice(0, 100), mode: "insensitive" } }, { propietarioNombre: { contains: String(q).slice(0, 100), mode: "insensitive" } }];
  const take = Math.min(Math.max(parseInt(size, 10) || 25, 1), 100);
  const total = await prisma.notificacion.count({ where });
  const paginas = Math.max(1, Math.ceil(total / take));
  const pagina = Math.min(Math.max(parseInt(page, 10) || 1, 1), paginas);
  const rows = await prisma.notificacion.findMany({ where, include: INCLUDE, orderBy: [{ estado: "asc" }, { createdAt: "desc" }], skip: (pagina - 1) * take, take });
  // Resumen para el encabezado: mis notificaciones por estado, envíos de hoy y las que me llegan de otros.
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
  const [porEstado, enviadasHoy, deOtros] = await Promise.all([
    prisma.notificacion.groupBy({ by: ["estado"], where: { propietarioUserId: user.id }, _count: true }),
    prisma.notificacionEjecucion.count({ where: { notificacion: { propietarioUserId: user.id }, origen: { not: "prueba" }, estado: { in: ["enviada", "parcial"] }, createdAt: { gte: inicioHoy } } }),
    prisma.notificacion.count({ where: { propietarioUserId: { not: user.id }, destinatarios: { some: { userId: user.id, deBaja: false } } } }),
  ]);
  const cuenta = Object.fromEntries(porEstado.map((g) => [g.estado, g._count]));
  return {
    total, page: pagina, size: take, notificaciones: rows.map((n) => toClient(n, user)),
    misCreadas: Object.values(cuenta).reduce((a, b) => a + b, 0),
    resumen: { activas: cuenta.activa || 0, pausadas: (cuenta.pausada || 0) + (cuenta.pausada_por_permisos || 0), borradores: cuenta.borrador || 0, enviadasHoy, deOtros },
    limites: LIMITES,
  };
}

// ---------- Escritura ----------

export async function createNotificacion(input, actor) {
  const regla = normalizarRegla(input);
  const users = await validarPermisos(regla, actor);
  await validarLimite(actor.id);
  const n = await prisma.notificacion.create({
    data: {
      ...datosDeRegla(regla),
      propietarioUserId: actor.id,
      propietarioNombre: actor.nombre,
      creadoPorUserId: actor.id,
      creadoPorNombre: actor.nombre,
      destinatarios: { create: users.map((u) => ({ userId: u.id, userNombre: u.nombre, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre })) },
    },
    include: INCLUDE,
  });
  logNotificacionCreate(actor, paraAuditoria(n)).catch(() => {});
  return toClient(n, actor);
}

export async function updateNotificacion(id, input, actor) {
  const before = await getNotificacion(id);
  if (!puedeGestionar(actor, before)) throw err(403, "Solo quien creó la notificación o un administrador puede editarla.");
  const regla = normalizarRegla(input);
  // Los permisos de datos se evalúan siempre con el PROPIETARIO, aunque edite un admin.
  const propietario = await prisma.user.findUnique({ where: { id: before.propietarioUserId } });
  const users = await validarPermisos(regla, propietario);
  // Una pausada que se edita sigue pausada, salvo que se pida reanudarla.
  const sigueEnPausa = regla.estado === "activa" && before.estado.startsWith("pausada") && input.reanudar !== true;

  const actuales = new Map(before.destinatarios.map((d) => [d.userId, d]));
  const nuevos = users.filter((u) => !actuales.has(u.id));
  const quitar = before.destinatarios.filter((d) => !regla.destinatarios.includes(d.userId)).map((d) => d.id);
  const after = await prisma.$transaction(async (tx) => {
    if (quitar.length) await tx.notificacionDestinatario.deleteMany({ where: { id: { in: quitar } } });
    if (nuevos.length) await tx.notificacionDestinatario.createMany({ data: nuevos.map((u) => ({ notificacionId: before.id, userId: u.id, userNombre: u.nombre, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre })) });
    const data = datosDeRegla(regla);
    if (sigueEnPausa) data.estado = before.estado;
    else if (data.estado === "activa") Object.assign(data, { motivoPausa: null, pausadaPorUserId: null, pausadaPorNombre: null, pausadaAt: null });
    return tx.notificacion.update({ where: { id: before.id }, data, include: INCLUDE });
  });
  logNotificacionUpdate(actor, paraAuditoria(before), paraAuditoria(after)).catch(() => {});
  return toClient(after, actor);
}

export async function deleteNotificacion(id, actor) {
  const n = await getNotificacion(id);
  if (!puedeGestionar(actor, n)) throw err(403, "Solo quien creó la notificación o un administrador puede eliminarla.");
  await prisma.notificacion.delete({ where: { id: n.id } });
  logNotificacionDelete(actor, paraAuditoria(n)).catch(() => {});
}

// accion: "pausar" | "reanudar"
export async function cambiarEstado(id, accion, actor, motivo) {
  const n = await getNotificacion(id);
  if (!puedeGestionar(actor, n)) throw err(403, "Solo quien creó la notificación o un administrador puede pausarla o reanudarla.");
  let data;
  if (accion === "pausar") {
    if (n.estado !== "activa") throw err(400, "Solo se puede pausar una notificación activa.");
    const esOtro = actor.id !== n.propietarioUserId;
    data = { estado: "pausada", pausadaPorUserId: actor.id, pausadaPorNombre: actor.nombre, pausadaAt: new Date(), motivoPausa: texto(motivo, 300) || (esOtro ? `Pausada por ${actor.nombre} (administrador)` : null) };
  } else if (accion === "reanudar") {
    if (!["pausada", "pausada_por_permisos", "borrador"].includes(n.estado)) throw err(400, "La notificación ya está activa.");
    const propietario = await prisma.user.findUnique({ where: { id: n.propietarioUserId } });
    if (!(await puedeVerFuente(propietario, n.fuente))) throw err(403, `No se puede reanudar: ${n.propietarioNombre} ya no tiene acceso a ${FUENTES[n.fuente]?.label || n.fuente}.`);
    const regla = normalizarRegla({ ...toClient(n, actor), destinatarios: n.destinatarios.map((d) => d.userId), estado: "activa" });
    await validarPermisos(regla, propietario);
    data = { estado: "activa", pausadaPorUserId: null, pausadaPorNombre: null, pausadaAt: null, motivoPausa: null };
  } else {
    throw err(400, "Acción no válida.");
  }
  const after = await prisma.notificacion.update({ where: { id: n.id }, data, include: INCLUDE });
  logNotificacionEstado(actor, paraAuditoria(n), accion, ESTADOS[n.estado], ESTADOS[after.estado], data.motivoPausa).catch(() => {});
  return toClient(after, actor);
}

// Pausa automática cuando el propietario pierde el acceso (la llama el motor).
export async function pausarPorPermisos(n, motivo) {
  await prisma.notificacion.update({ where: { id: n.id }, data: { estado: "pausada_por_permisos", motivoPausa: motivo, pausadaAt: new Date(), pausadaPorNombre: "Sistema", pausadaPorUserId: null } });
  logNotificacionEstado(null, paraAuditoria(n), "pausar", ESTADOS[n.estado], ESTADOS.pausada_por_permisos, motivo).catch(() => {});
}

// El destinatario deja de recibir (baja) o vuelve a recibir (alta). Siempre sobre sí mismo.
export async function cambiarSuscripcion(id, accion, actor) {
  const n = await getNotificacion(id);
  const d = n.destinatarios.find((x) => x.userId === actor.id);
  if (!d) throw err(404, "No eres destinatario de esta notificación.");
  if (accion === "baja") {
    if (d.deBaja) return toClient(n, actor);
    await prisma.notificacionDestinatario.update({ where: { id: d.id }, data: { deBaja: true, deBajaAt: new Date() } });
  } else if (accion === "alta") {
    if (!d.deBaja) return toClient(n, actor);
    if (!(await puedeVerFuente(actor, n.fuente))) throw err(403, `Tu rol ya no tiene acceso a ${FUENTES[n.fuente]?.label || n.fuente}.`);
    await prisma.notificacionDestinatario.update({ where: { id: d.id }, data: { deBaja: false, deBajaAt: null } });
  } else {
    throw err(400, "Acción no válida.");
  }
  logNotificacionSuscripcion(actor, paraAuditoria(n), accion, actor.nombre).catch(() => {});
  return toClient(await getNotificacion(id), actor);
}

// ---------- Historial ----------

export async function listEjecuciones(id, user, { page = 1, size = 25 } = {}) {
  const n = await getNotificacion(id);
  const esDest = n.destinatarios.some((d) => d.userId === user.id);
  if (!puedeGestionar(user, n) && !esDest) throw err(403, "No autorizado.");
  const take = Math.min(Math.max(parseInt(size, 10) || 25, 1), 100);
  const where = { notificacionId: n.id };
  const total = await prisma.notificacionEjecucion.count({ where });
  const paginas = Math.max(1, Math.ceil(total / take));
  const pagina = Math.min(Math.max(parseInt(page, 10) || 1, 1), paginas);
  const rows = await prisma.notificacionEjecucion.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (pagina - 1) * take, take,
    include: { entregas: { orderBy: [{ userNombre: "asc" }, { canal: "asc" }], select: { id: true, userId: true, userNombre: true, canal: true, estado: true, motivo: true, intentos: true, enviadaAt: true, leidaAt: true } } },
  });
  return {
    total, page: pagina, size: take,
    ejecuciones: rows.map((e) => ({
      id: e.id, origen: e.origen, estado: e.estado, resultados: e.resultados, error: e.error, retrasoMin: e.retrasoMin,
      createdAt: e.createdAt, creadoPorNombre: e.creadoPorNombre,
      // Quien no gestiona la notificación solo ve sus propias entregas.
      entregas: puedeGestionar(user, n) ? e.entregas : e.entregas.filter((x) => x.userId === user.id),
    })),
  };
}

// ---------- Bandeja (entregas por la app) ----------

export async function listBandeja(user, { page = 1, size = 25, soloNoLeidas = false } = {}) {
  const where = { userId: user.id, canal: "app", estado: "enviada", ...(soloNoLeidas ? { leidaAt: null } : {}) };
  const take = Math.min(Math.max(parseInt(size, 10) || 25, 1), 100);
  const [total, noLeidas] = await Promise.all([prisma.notificacionEntrega.count({ where }), contarNoLeidas(user)]);
  const paginas = Math.max(1, Math.ceil(total / take));
  const pagina = Math.min(Math.max(parseInt(page, 10) || 1, 1), paginas);
  const rows = await prisma.notificacionEntrega.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (pagina - 1) * take, take,
    include: { ejecucion: { select: { origen: true, notificacionId: true, notificacion: { select: { nombre: true, fuente: true, disparador: true, evento: true, agrupacion: true, frecuencia: true, diaSemana: true, diaMes: true, ordinal: true, fechaUnica: true, hora: true, siFestivo: true, propietarioUserId: true, propietarioNombre: true } } } } },
  });
  return {
    total, page: pagina, size: take, noLeidas,
    items: rows.map((e) => ({
      id: e.id,
      contenido: parse(e.contenido, null),
      leidaAt: e.leidaAt,
      createdAt: e.createdAt,
      origen: e.ejecucion?.origen,
      notificacionId: e.ejecucion?.notificacionId,
      // De qué configuración viene: nombre actual (o el del momento del envío si ya se eliminó), fuente y programación.
      notificacionNombre: e.ejecucion?.notificacion?.nombre || parse(e.contenido, {})?.notificacionNombre || null,
      fuente: e.ejecucion?.notificacion?.fuente || parse(e.contenido, {})?.fuente || null,
      cuando: e.ejecucion?.notificacion ? describirCuando(e.ejecucion.notificacion) : null,
      deOtro: e.ejecucion?.notificacion ? e.ejecucion.notificacion.propietarioUserId !== user.id : false,
      propietarioNombre: e.ejecucion?.notificacion?.propietarioNombre || null,
    })),
  };
}

// Solo cuenta las notificaciones de ESTE módulo (no los pendientes de Mi día).
export function contarNoLeidas(user) {
  return prisma.notificacionEntrega.count({ where: { userId: user.id, canal: "app", estado: "enviada", leidaAt: null } });
}

// Avisos en vivo (toasts): entregas por la app más nuevas que `desdeId`. Sin `desdeId` solo devuelve el último id,
// para que al abrir el panel no salten como nuevas las que ya estaban.
export async function nuevasDesde(user, desdeId) {
  const base = { userId: user.id, canal: "app", estado: "enviada" };
  if (desdeId == null || desdeId === "") {
    const ultima = await prisma.notificacionEntrega.findFirst({ where: base, orderBy: { id: "desc" }, select: { id: true } });
    return { ultimoId: ultima?.id || 0, nuevas: [] };
  }
  const rows = await prisma.notificacionEntrega.findMany({
    where: { ...base, id: { gt: Number(desdeId) || 0 }, leidaAt: null },
    orderBy: { id: "desc" },
    take: 5,
    include: { ejecucion: { select: { origen: true, notificacion: { select: { nombre: true, fuente: true, propietarioNombre: true } } } } },
  });
  const ultimoId = rows.length ? rows[0].id : Number(desdeId) || 0;
  return {
    ultimoId,
    nuevas: rows.map((e) => {
      const c = parse(e.contenido, {});
      return {
        id: e.id,
        titulo: c.titulo || e.ejecucion?.notificacion?.nombre || "Notificación",
        texto: c.texto || "",
        total: c.total ?? null,
        origen: e.ejecucion?.origen,
        manualPor: c.manualPor || null,
        notificacionNombre: e.ejecucion?.notificacion?.nombre || c.notificacionNombre || null,
        fuente: e.ejecucion?.notificacion?.fuente || c.fuente || null,
        configuradaPor: e.ejecucion?.notificacion?.propietarioNombre || c.configuradaPor || null,
      };
    }),
  };
}

export async function marcarLeidas(user, { ids, todas } = {}) {
  const where = { userId: user.id, canal: "app", leidaAt: null };
  if (!todas) {
    const lista = Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger).slice(0, 200) : [];
    if (!lista.length) return { actualizadas: 0 };
    where.id = { in: lista };
  }
  const r = await prisma.notificacionEntrega.updateMany({ where, data: { leidaAt: new Date() } });
  return { actualizadas: r.count };
}
