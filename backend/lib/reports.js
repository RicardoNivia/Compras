import { prisma } from "@/lib/prisma";
import { logReportCreate, logReportUpdate, logReportDelete } from "@/lib/audit";
import { FRECUENCIAS, proximasFechas, describirProgramacion } from "@/lib/reportSchedule";

const CONDICIONES = ["siempre", "presupuesto80", "fueraPlazo"];
const ENTREGAS = ["yo", "correo", "teams"];
// Teams todavía no está disponible (ver docs/teams-notificaciones-fase2.md): se guarda la preferencia pero no se acepta.
const ENTREGAS_DISPONIBLES = ["yo", "correo"];
const PRIORIDADES = ["alta", "media", "baja"];
const CUERPO_MODOS = ["plano", "resumen"];
const PERIODOS_VALIDOS = ["historico", "mes_actual", "mes_anterior", "anio_actual", "anio_anterior", "semana_anterior"];
const TIPOS_VALIDOS = ["bloques", "dashboard", "estudio"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function parseEmailList(value) {
  const list = Array.isArray(value) ? value.map((e) => String(e).trim()).filter(Boolean) : [];
  const invalid = list.find((e) => !EMAIL_RE.test(e));
  if (invalid) throw badRequest(`"${invalid}" no es un correo válido.`);
  return list;
}

function parseJson(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

function toClientReport(r) {
  const activoProgramado = r.activo && !r.esBorrador;
  return {
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo || "bloques",
    prompt: r.prompt,
    bloques: r.bloques ? JSON.parse(r.bloques) : [],
    periodoGeneral: r.periodoGeneral || "historico",
    destinatarios: r.destinatarios ? JSON.parse(r.destinatarios) : [],
    cc: r.cc ? JSON.parse(r.cc) : [],
    frecuencia: r.frecuencia,
    diaSemana: r.diaSemana,
    diaMes: r.diaMes,
    hora: r.hora,
    sabadoHabil: r.sabadoHabil,
    domingoHabil: r.domingoHabil,
    prioridad: r.prioridad,
    cuerpoModo: r.cuerpoModo,
    cuerpoPrompt: r.cuerpoPrompt,
    cuerpoHtml: r.cuerpoHtml,
    activo: r.activo,
    esBorrador: r.esBorrador,
    ultimoContenido: r.ultimoContenido ? JSON.parse(r.ultimoContenido) : null,
    ultimoCuerpoCorreo: r.ultimoCuerpoCorreo || null,
    ultimoEnvio: r.ultimoEnvio,
    pedido: r.pedido || null,
    contexto: parseJson(r.contexto, {}),
    // Para Auditoría: el propósito y quiénes tienen acceso (informes solo para consultar), como texto comparable.
    proposito: parseJson(r.contexto, {}).proposito === "consulta" ? "Solo para consultar" : "Para enviar",
    accesoNombres: (parseJson(r.contexto, {}).acceso || []).map((x) => x.nombre).join(", "),
    reglaTexto: r.reglaTexto || null,
    ordinal: r.ordinal,
    fechaUnica: r.fechaUnica || null,
    saltarFestivos: r.saltarFestivos !== false,
    condicion: r.condicion || "siempre",
    entrega: r.entrega || "yo",
    responsables: parseJson(r.responsables, []),
    asunto: r.asunto || null,
    mensaje: r.mensaje || null,
    programacionTexto: describirProgramacion(r),
    proximaFecha: activoProgramado ? proximasFechas(r, 1)[0] || null : null,
    createdBy: r.createdBy,
    createdByNombre: r.createdByNombre,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function validate(body, { partial = false } = {}) {
  const out = {};
  // Un borrador se puede guardar incompleto a propósito (sin destinatarios,
  // sin prompt/bloques todavía) para retomarlo después — ver botón "Guardar
  // como borrador" en ReportEditor.jsx. El scheduler lo ignora por completo
  // mientras esBorrador sea true (ver reportScheduler.js).
  const esBorrador = !!body.esBorrador;

  if (!partial || body.nombre !== undefined) {
    if (!body.nombre || !String(body.nombre).trim()) throw badRequest("El nombre del informe es obligatorio.");
    out.nombre = String(body.nombre).trim();
  }
  if (!partial || body.tipo !== undefined) {
    out.tipo = TIPOS_VALIDOS.includes(body.tipo) ? body.tipo : "bloques";
  }
  // El contenido real del informe vive en "bloques" (ver ReportBloqueBuilder.jsx
  // en el frontend); "prompt" ahora es opcional — solo se usa como semilla para
  // "generar un borrador con IA" dentro del constructor de bloques. Se valida
  // que al menos uno de los dos exista, pero solo al crear (!partial): al
  // editar, cada campo se guarda de forma independiente según lo que mande el
  // cliente, para no borrar uno al actualizar solo el otro.
  if (!partial || body.prompt !== undefined) {
    out.prompt = body.prompt ? String(body.prompt).trim() : null;
  }
  if (!partial || body.bloques !== undefined) {
    out.bloques = JSON.stringify(Array.isArray(body.bloques) ? body.bloques : []);
  }
  if (!partial || body.periodoGeneral !== undefined) {
    out.periodoGeneral = PERIODOS_VALIDOS.includes(body.periodoGeneral) ? body.periodoGeneral : "historico";
  }
  if (!partial && !esBorrador) {
    const hasPrompt = !!(out.prompt && out.prompt.trim());
    const hasBloques = out.bloques && JSON.parse(out.bloques).length > 0;
    if (!hasPrompt && !hasBloques) {
      throw badRequest("Describe qué debe contener el informe (prompt) o agrega al menos un bloque.");
    }
  }
  if (!partial || body.destinatarios !== undefined) {
    const list = parseEmailList(body.destinatarios);
    // Un informe solo para consultar no se envía (sus "fotos automáticas" no necesitan destinatarios).
    const consulta = body.contexto?.proposito === "consulta";
    if (!list.length && !esBorrador && !consulta) throw badRequest("Agrega al menos un destinatario.");
    out.destinatarios = JSON.stringify(list);
  }
  if (!partial || body.cc !== undefined) {
    out.cc = JSON.stringify(parseEmailList(body.cc));
  }
  if (!partial || body.frecuencia !== undefined) {
    if (!FRECUENCIAS.includes(body.frecuencia)) throw badRequest("Frecuencia inválida.");
    out.frecuencia = body.frecuencia;
    const usaDiaSemana = body.frecuencia === "semanal" || body.frecuencia === "mensual_semana";
    out.diaSemana = usaDiaSemana ? Number(body.diaSemana) : null;
    out.diaMes = body.frecuencia === "mensual" ? Number(body.diaMes) : null;
    out.ordinal = body.frecuencia === "mensual_semana" ? Number(body.ordinal || 1) : null;
    out.fechaUnica = body.frecuencia === "unica" ? String(body.fechaUnica || "") : null;
    if (usaDiaSemana && (Number.isNaN(out.diaSemana) || out.diaSemana < 0 || out.diaSemana > 6)) {
      throw badRequest("Selecciona el día de la semana.");
    }
    if (body.frecuencia === "mensual_semana" && ![1, 2, 3, 4, -1].includes(out.ordinal)) throw badRequest("Indica si es el primer, segundo, tercer, cuarto o último día del mes.");
    if (body.frecuencia === "unica" && !/^\d{4}-\d{2}-\d{2}$/.test(out.fechaUnica)) throw badRequest("Indica la fecha del envío único.");
    if (body.frecuencia === "mensual" && (Number.isNaN(out.diaMes) || out.diaMes < 1 || out.diaMes > 31)) {
      throw badRequest("Selecciona el día del mes (1 a 31).");
    }
  }
  if (!partial || body.hora !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.hora || "")) throw badRequest("La hora debe tener formato HH:mm.");
    out.hora = body.hora;
  }
  if (!partial || body.sabadoHabil !== undefined) {
    out.sabadoHabil = !!body.sabadoHabil;
  }
  if (!partial || body.domingoHabil !== undefined) {
    out.domingoHabil = !!body.domingoHabil;
  }
  // Ya no es configurable desde la UI — si llega (p.ej. un cliente viejo) se
  // valida igual, pero nunca es obligatoria; createReport la completa con el
  // valor por defecto de la BD ("media") cuando no se envía.
  if (body.prioridad !== undefined) {
    if (!PRIORIDADES.includes(body.prioridad)) throw badRequest("Prioridad inválida.");
    out.prioridad = body.prioridad;
  }
  // cuerpoModo/cuerpoPrompt quedaron como legado (generación del cuerpo con
  // IA) — el flujo actual es editar "cuerpoHtml" directamente (ver
  // ReportBodyEditor.jsx), así que ninguno de los tres es obligatorio.
  if (!partial || body.cuerpoModo !== undefined) {
    out.cuerpoModo = CUERPO_MODOS.includes(body.cuerpoModo) ? body.cuerpoModo : "resumen";
  }
  if (!partial || body.cuerpoPrompt !== undefined) {
    out.cuerpoPrompt = body.cuerpoPrompt ? String(body.cuerpoPrompt).trim() : null;
  }
  if (!partial || body.cuerpoHtml !== undefined) {
    out.cuerpoHtml = body.cuerpoHtml ? String(body.cuerpoHtml) : null;
  }
  if (partial && body.activo !== undefined) {
    out.activo = !!body.activo;
  }
  if (!partial || body.esBorrador !== undefined) {
    out.esBorrador = esBorrador;
  }
  // ---- Estudio de informes ----
  if (body.pedido !== undefined) out.pedido = body.pedido ? String(body.pedido).trim().slice(0, 2000) : null;
  if (body.contexto !== undefined) out.contexto = body.contexto ? JSON.stringify(body.contexto) : null;
  if (body.reglaTexto !== undefined) out.reglaTexto = body.reglaTexto ? String(body.reglaTexto).trim().slice(0, 300) : null;
  if (body.saltarFestivos !== undefined) out.saltarFestivos = body.saltarFestivos !== false;
  if (body.condicion !== undefined) {
    if (!CONDICIONES.includes(body.condicion)) throw badRequest("Condición de envío inválida.");
    out.condicion = body.condicion;
  }
  if (body.entrega !== undefined) {
    if (!ENTREGAS.includes(body.entrega)) throw badRequest("Forma de entrega inválida.");
    if (!ENTREGAS_DISPONIBLES.includes(body.entrega)) throw badRequest("El envío por Microsoft Teams estará disponible próximamente.");
    out.entrega = body.entrega;
  }
  if (body.responsables !== undefined) {
    const lista = Array.isArray(body.responsables) ? body.responsables.filter((x) => x && x.id).map((x) => ({ id: String(x.id), nombre: String(x.nombre || "") })) : [];
    out.responsables = JSON.stringify(lista);
  }
  if (body.asunto !== undefined) out.asunto = body.asunto ? String(body.asunto).slice(0, 300) : null;
  if (body.mensaje !== undefined) out.mensaje = body.mensaje ? String(body.mensaje).slice(0, 5000) : null;

  if (body.contenido !== undefined) {
    out.ultimoContenido = body.contenido ? JSON.stringify(body.contenido) : null;
  }
  if (body.ultimoCuerpoCorreo !== undefined) {
    out.ultimoCuerpoCorreo = body.ultimoCuerpoCorreo || null;
  }

  return out;
}

// Incluye cuántas ediciones de cada informe están por enviar y cuándo se envió por última vez (columnas de Mis informes).
export async function listReports() {
  const [rows, pendientes, enviados, todas, fotos] = await Promise.all([
    prisma.reportConfig.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.reportEdicion.groupBy({ by: ["reportId"], where: { estado: "por_enviar", origen: { not: "prueba" } }, _count: { _all: true } }),
    prisma.reportEdicion.groupBy({ by: ["reportId"], where: { estado: "enviado", origen: { not: "prueba" } }, _max: { enviadoAt: true } }),
    prisma.reportEdicion.groupBy({ by: ["reportId"], _count: { _all: true } }),
    prisma.reportEdicion.groupBy({ by: ["reportId"], where: { origen: "foto" }, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  const fotosDe = new Map(fotos.map((p) => [p.reportId, p]));
  const totales = new Map(todas.map((p) => [p.reportId, p._count._all]));
  const ultimo = new Map(enviados.map((p) => [p.reportId, p._max.enviadoAt]));
  const porEnviar = new Map(pendientes.map((p) => [p.reportId, p._count._all]));
  return rows.map((r) => ({ ...toClientReport(r), porEnviar: porEnviar.get(r.id) || 0, ultimoEnvioAt: ultimo.get(r.id) || null, totalEnvios: totales.get(r.id) || 0,
    totalFotos: fotosDe.get(r.id)?._count._all || 0, ultimaFotoAt: fotosDe.get(r.id)?._max.createdAt || null }));
}

export async function getReport(id) {
  const r = await prisma.reportConfig.findUnique({ where: { id } });
  if (!r) throw Object.assign(new Error("Informe no encontrado."), { status: 404 });
  return r; // versión Prisma cruda (uso interno del scheduler/mailer)
}

// Dos informes no pueden llamarse igual (sin distinguir mayúsculas ni espacios de más).
const claveNombre = (n) => String(n || "").trim().replace(/\s+/g, " ").toLowerCase();

async function nombreEnUso(nombre, exceptoId = null) {
  const clave = claveNombre(nombre);
  const rows = await prisma.reportConfig.findMany({ select: { id: true, nombre: true } });
  return rows.some((r) => r.id !== exceptoId && claveNombre(r.nombre) === clave);
}

// Con ajustarNombre (informes que arma Nova o en blanco) se agrega " (2)", " (3)"… en vez de rechazar.
async function nombreDisponible(nombre) {
  const rows = await prisma.reportConfig.findMany({ select: { nombre: true } });
  const usados = new Set(rows.map((r) => claveNombre(r.nombre)));
  if (!usados.has(claveNombre(nombre))) return nombre;
  for (let i = 2; i < 200; i++) {
    const n = `${nombre} (${i})`;
    if (!usados.has(claveNombre(n))) return n;
  }
  return `${nombre} (${Date.now()})`;
}

export async function createReport(body, actor) {
  const data = validate(body);
  if (body.ajustarNombre) data.nombre = await nombreDisponible(data.nombre);
  else if (await nombreEnUso(data.nombre)) throw badRequest(`Ya existe un informe llamado "${data.nombre}". Usa otro nombre.`);
  data.activo = !data.esBorrador;
  if (!data.prioridad) data.prioridad = "media";
  // Quien crea el informe es, por defecto, quien recibe el aviso para enviarlo ("Lo envío yo").
  if (!data.responsables && actor?.id) data.responsables = JSON.stringify([{ id: actor.id, nombre: actor.nombre || "" }]);
  const row = await prisma.reportConfig.create({
    data: { ...data, createdBy: actor?.id || null, createdByNombre: actor?.nombre || null },
  });
  const client = toClientReport(row);
  await logReportCreate(actor, client).catch(() => {});
  return client;
}

export async function updateReport(id, body, actor) {
  const existing = await prisma.reportConfig.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error("Informe no encontrado."), { status: 404 });
  const data = validate(body, { partial: true });
  if (data.nombre !== undefined && claveNombre(data.nombre) !== claveNombre(existing.nombre) && (await nombreEnUso(data.nombre, id))) {
    throw badRequest(`Ya existe un informe llamado "${data.nombre}". Usa otro nombre.`);
  }
  const row = await prisma.reportConfig.update({ where: { id }, data });
  const before = toClientReport(existing);
  const after = toClientReport(row);
  await logReportUpdate(actor, before, after).catch(() => {});
  return after;
}

export async function deleteReport(id, actor) {
  const existing = await prisma.reportConfig.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error("Informe no encontrado."), { status: 404 });
  // Un informe que ya tiene envíos no se borra (se perdería su historial y sus PDF): solo se puede desactivar.
  const envios = await prisma.reportEdicion.count({ where: { reportId: id } });
  if (envios > 0) {
    throw Object.assign(new Error(`Este informe ya tiene ${envios} envío(s) en su historial y no se puede eliminar. Puedes desactivarlo para que deje de generarse.`), { status: 400 });
  }
  await prisma.reportConfig.delete({ where: { id } });
  await logReportDelete(actor, toClientReport(existing)).catch(() => {});
}

export async function markSent(id, contenido, emailBody) {
  await prisma.reportConfig.update({
    where: { id },
    data: {
      ultimoEnvio: new Date(),
      ultimoContenido: contenido ? JSON.stringify(contenido) : undefined,
      ultimoCuerpoCorreo: emailBody !== undefined ? emailBody : undefined,
    },
  });
}

export { toClientReport };
