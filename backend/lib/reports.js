import { prisma } from "@/lib/prisma";
import { logReportCreate, logReportUpdate, logReportDelete } from "@/lib/audit";

const FRECUENCIAS = ["diaria", "semanal", "mensual"];
const PRIORIDADES = ["alta", "media", "baja"];
const CUERPO_MODOS = ["plano", "resumen"];
const PERIODOS_VALIDOS = ["historico", "mes_actual", "mes_anterior", "anio_actual", "anio_anterior"];
const TIPOS_VALIDOS = ["bloques", "dashboard"];
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

function toClientReport(r) {
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
    if (!list.length && !esBorrador) throw badRequest("Agrega al menos un destinatario.");
    out.destinatarios = JSON.stringify(list);
  }
  if (!partial || body.cc !== undefined) {
    out.cc = JSON.stringify(parseEmailList(body.cc));
  }
  if (!partial || body.frecuencia !== undefined) {
    if (!FRECUENCIAS.includes(body.frecuencia)) throw badRequest("Frecuencia inválida.");
    out.frecuencia = body.frecuencia;
    out.diaSemana = body.frecuencia === "semanal" ? Number(body.diaSemana) : null;
    out.diaMes = body.frecuencia === "mensual" ? Number(body.diaMes) : null;
    if (body.frecuencia === "semanal" && (Number.isNaN(out.diaSemana) || out.diaSemana < 0 || out.diaSemana > 6)) {
      throw badRequest("Selecciona el día de la semana.");
    }
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
  if (body.contenido !== undefined) {
    out.ultimoContenido = body.contenido ? JSON.stringify(body.contenido) : null;
  }
  if (body.ultimoCuerpoCorreo !== undefined) {
    out.ultimoCuerpoCorreo = body.ultimoCuerpoCorreo || null;
  }

  return out;
}

export async function listReports() {
  const rows = await prisma.reportConfig.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toClientReport);
}

export async function getReport(id) {
  const r = await prisma.reportConfig.findUnique({ where: { id } });
  if (!r) throw Object.assign(new Error("Informe no encontrado."), { status: 404 });
  return r; // versión Prisma cruda (uso interno del scheduler/mailer)
}

export async function createReport(body, actor) {
  const data = validate(body);
  data.activo = !data.esBorrador;
  if (!data.prioridad) data.prioridad = "media";
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
  const row = await prisma.reportConfig.update({ where: { id }, data });
  const before = toClientReport(existing);
  const after = toClientReport(row);
  await logReportUpdate(actor, before, after).catch(() => {});
  return after;
}

export async function deleteReport(id, actor) {
  const existing = await prisma.reportConfig.findUnique({ where: { id } });
  if (!existing) throw Object.assign(new Error("Informe no encontrado."), { status: 404 });
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
