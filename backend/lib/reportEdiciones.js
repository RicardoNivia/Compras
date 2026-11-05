import { prisma } from "@/lib/prisma";
import { generateReportContent, resumenCifras, huella, textoAlcance } from "@/lib/reportContent";
import { generateReportPdfBuffer } from "@/lib/reportPdf";
import { periodoLabel, MESES } from "@/lib/reportSchedule";
import { generateStructuredJson } from "@/lib/aiStructured";
import { sendReportEmail, isMailerConfigured, MAIL_MAINTENANCE } from "@/lib/mailer";
import { markSent } from "@/lib/reports";
import { logEdicionGenerada, logEdicionEnviada, logEdicionDescargada } from "@/lib/audit";

// Ediciones del Estudio de informes: cada vez que un informe se genera (a su hora, a mano o como prueba) queda una
// ReportEdicion con su PDF tal como salió ese día. Mientras no haya correo saliente (MAIL_MAINTENANCE), la edición
// queda "por_enviar" y le aparece al responsable en Mi día para enviarla él mismo desde Outlook ("Lo envío yo").

export const PROGRAMADOR = "Programación automática";

function parse(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

// Opciones de generación de un informe guardado (o del borrador que manda el editor).
export function opcionesDe(report) {
  const contexto = typeof report.contexto === "string" ? parse(report.contexto, {}) : report.contexto || {};
  const estudio = report.tipo === "estudio";
  return {
    contenido: {
      prompt: report.prompt,
      bloques: report.bloques,
      nombre: report.nombre,
      periodoGeneral: report.periodoGeneral,
      excluirAnulados: estudio ? contexto.excluirAnulados !== false : false,
      filtros: estudio ? contexto.filtros || null : null,
    },
    pdf: {
      nombre: report.nombre,
      prioridad: report.prioridad,
      dashboardLayout: report.tipo === "dashboard",
      estudio,
      subtitulo: estudio ? [periodoLabel(report.periodoGeneral), textoAlcance(contexto.filtros), contexto.audiencia ? `Para ${contexto.audiencia}` : null].filter(Boolean).join(" · ") : undefined,
    },
    excluirAnulados: estudio ? contexto.excluirAnulados !== false : false,
    filtros: estudio ? contexto.filtros || null : null,
  };
}

function fmtPesosCorto(n) {
  return `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, notation: "compact", compactDisplay: "short" }).format(n || 0)}`;
}

// 2 o 3 líneas que resumen el informe para el cuerpo del correo ({resumen_nova}). Si el informe tiene secciones de Nova,
// el resumen ya vino en la misma llamada (content.resumenNova). Si no, se pide aparte, pero solo si las secciones
// cambiaron desde la edición anterior (huella en previas). Si la IA falla, un resumen simple con las cifras ya
// calculadas: el correo nunca queda sin texto.
async function resumenNova(content, cifras, previas = {}) {
  const basico = `se comprometieron ${fmtPesosCorto(cifras.valor)} en ${cifras.compras} compras${cifras.cumplimientoPct != null ? `, con ${cifras.cumplimientoPct}% de cumplimiento de tiempos` : ""}.`;
  if (content.resumenNova) return { texto: content.resumenNova };
  const prompt = `Contenido del informe (secciones ya calculadas):\n${JSON.stringify((content.secciones || []).map((s) => ({ titulo: s.titulo, destacado: s.destacado, contenido: s.contenido, variacion: s.variacion?.texto })))}`;
  const clave = huella(`resumen-correo|${prompt}`);
  if (previas[clave]?.texto) return { texto: previas[clave].texto, clave };
  try {
    const res = await generateStructuredJson({
      systemInstruction: "Escribes el resumen corto que va en el cuerpo de un correo que acompaña un informe de compras en PDF. Español de Colombia, tono profesional y cordial. 2 o 3 frases, sin saludo ni despedida, empezando en minúscula porque va después de \"En resumen:\". Usa solo cifras que aparezcan en el contenido entregado; nunca inventes datos.",
      prompt,
      schema: { type: "OBJECT", properties: { resumen: { type: "STRING" } }, required: ["resumen"] },
      budgetMs: 25000,
    });
    const texto = (res.resumen || "").trim();
    return texto ? { texto, clave } : { texto: basico };
  } catch {
    return { texto: basico };
  }
}

// Huellas de los textos de Nova de la última edición del informe (content._ia), para no volver a pedirle a la IA lo
// mismo cuando los datos no cambiaron (ver resolverIaEnLote en reportContent.js).
async function huellasPrevias(reportId) {
  const prev = await prisma.reportEdicion.findFirst({
    where: { reportId, origen: { not: "foto" }, estado: { in: ["por_enviar", "enviado"] } },
    orderBy: { createdAt: "desc" },
    select: { contenido: true },
  }).catch(() => null);
  return parse(prev?.contenido, {})._ia || {};
}

// Reemplaza {mes} {año} {periodo} {valor_total} {fecha_envio} {resumen_nova} en el asunto y el mensaje.
export function aplicarVariables(texto, vars) {
  return String(texto || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}

function variablesDe(report, cifras, resumen, now = new Date()) {
  const etiqueta = periodoLabel(report.periodoGeneral, now);
  const [mesTxt] = etiqueta.split(" ");
  return {
    mes: MESES.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).includes(mesTxt) ? mesTxt : etiqueta,
    año: (etiqueta.match(/\d{4}/) || [String(now.getFullYear())])[0],
    periodo: etiqueta,
    valor_total: fmtPesosCorto(cifras.valor),
    fecha_envio: now.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }),
    resumen_nova: resumen,
  };
}

export const ASUNTO_DEFECTO = "{nombre} · {periodo}";
export const MENSAJE_DEFECTO = "Buen día,\n\nAdjunto el informe {nombre} de {periodo}. En resumen: {resumen_nova}\n\nQuedo atento a cualquier comentario.";

// Genera una edición. origen: "programado" (el programador), "manual" (botón "Generar ahora"), "prueba" (solo para quien la pide).
// ahora: fecha de referencia (por defecto ahora mismo). Con una fecha pasada se genera el envío como si fuera ese día:
// sirve para reponer el informe de un período que no se generó (queda con esa fecha en el historial).
export async function generarEdicion(report, { origen = "programado", actor = null, ahora = null } = {}) {
  const now = ahora || new Date();
  const { contenido: opts, pdf: pdfOpts, excluirAnulados, filtros } = opcionesDe(report);
  const etiqueta = periodoLabel(report.periodoGeneral, now);
  const creador = actor ? { creadoPorUserId: actor.id, creadoPorNombre: actor.nombre } : { creadoPorUserId: null, creadoPorNombre: PROGRAMADOR };
  const base = { reportId: report.id, periodoLabel: etiqueta, origen, ...creador, ...(ahora ? { createdAt: now } : {}) };

  try {
    // La condición de envío ("solo si hay algo que contar") se retiró de la interfaz: todo informe programado se
    // genera siempre, aunque tenga guardada una condición de antes.

    // "foto": informes solo para consultar. Congela el informe tal como está (cifras de hoy + texto de Nova guardado,
    // sin llamar a la IA) y lo deja en su histórico; no se envía.
    if (origen === "foto") {
      const contentFoto = await generateReportContent({ ...opts, ahora: now, sinIa: true });
      const [pdfFoto, cifrasFoto] = await Promise.all([
        generateReportPdfBuffer(contentFoto, { ...pdfOpts, fecha: now }),
        resumenCifras(report.periodoGeneral, { excluirAnulados, ahora: now, filtros }),
      ]);
      const foto = await prisma.reportEdicion.create({
        data: { ...base, estado: "guardado", contenido: JSON.stringify(contentFoto), pdf: pdfFoto, resumen: JSON.stringify(cifrasFoto) },
      });
      await logEdicionGenerada(actor, report, foto).catch(() => {});
      return foto;
    }

    const plantillaMensaje = report.mensaje || MENSAJE_DEFECTO;
    const conResumen = plantillaMensaje.includes("{resumen_nova}");
    const previasIa = await huellasPrevias(report.id);
    const content = await generateReportContent({ ...opts, ahora: now, previasIa, conResumen });
    const [pdfBuffer, cifras] = await Promise.all([
      generateReportPdfBuffer(content, { ...pdfOpts, fecha: now, subtitulo: pdfOpts.subtitulo ? pdfOpts.subtitulo.replace(periodoLabel(report.periodoGeneral), etiqueta) : pdfOpts.subtitulo }),
      resumenCifras(report.periodoGeneral, { excluirAnulados, ahora: now, filtros }),
    ]);
    const res = conResumen ? await resumenNova(content, cifras, previasIa) : null;
    const resumen = res?.texto || "";
    if (res?.clave) content._ia = { ...(content._ia || {}), [res.clave]: { texto: res.texto } };
    const vars = { ...variablesDe(report, cifras, resumen, now), nombre: report.nombre };
    const destinatarios = parse(report.destinatarios, []);
    const cc = parse(report.cc, []);

    let ed = await prisma.reportEdicion.create({
      data: {
        ...base,
        estado: "por_enviar",
        contenido: JSON.stringify(content),
        pdf: pdfBuffer,
        asunto: aplicarVariables(report.asunto || ASUNTO_DEFECTO, vars),
        mensaje: aplicarVariables(plantillaMensaje, vars),
        destinatarios: JSON.stringify(destinatarios),
        cc: JSON.stringify(cc),
        resumen: JSON.stringify(cifras),
      },
    });
    await logEdicionGenerada(actor, report, ed).catch(() => {});

    // Correo automático: solo si el informe lo pide y hay correo saliente. Si no, queda para "Lo envío yo".
    if (origen !== "prueba" && report.entrega === "correo" && !MAIL_MAINTENANCE && isMailerConfigured() && destinatarios.length) {
      try {
        await sendReportEmail({
          to: destinatarios,
          cc,
          subject: ed.asunto,
          text: ed.mensaje,
          attachments: [{ filename: nombreArchivo(report.nombre, etiqueta), content: pdfBuffer, contentType: "application/pdf" }],
        });
        ed = await prisma.reportEdicion.update({ where: { id: ed.id }, data: { estado: "enviado", enviadoAt: new Date(), enviadoPorNombre: "Correo automático" } });
        await logEdicionEnviada(null, report, ed).catch(() => {});
      } catch (err) {
        ed = await prisma.reportEdicion.update({ where: { id: ed.id }, data: { motivo: `El correo automático falló (${err.message}); envíalo tú.` } });
      }
    }
    if (origen !== "prueba" && !ahora) await markSent(report.id, content, ed.mensaje).catch(() => {});
    return ed;
  } catch (err) {
    const ed = await prisma.reportEdicion.create({ data: { ...base, estado: "error", motivo: err.message || "No se pudo generar." } });
    await logEdicionGenerada(actor, report, ed).catch(() => {});
    return ed;
  }
}

export function nombreArchivo(nombre, etiqueta) {
  const limpio = `${nombre || "Informe"} ${etiqueta || ""}`.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-");
  return `${limpio || "Informe"}.pdf`;
}

export function toClientEdicion(e, report) {
  return {
    id: e.id,
    reportId: e.reportId,
    reportNombre: report?.nombre || e.report?.nombre || null,
    periodoLabel: e.periodoLabel,
    origen: e.origen,
    estado: e.estado,
    motivo: e.motivo,
    asunto: e.asunto,
    mensaje: e.mensaje,
    destinatarios: parse(e.destinatarios, []),
    cc: parse(e.cc, []),
    resumen: parse(e.resumen, null),
    tienePdf: e.pdf != null ? true : !!e.tienePdf,
    archivo: nombreArchivo(report?.nombre || e.report?.nombre, e.periodoLabel),
    descargadoAt: e.descargadoAt,
    enviadoAt: e.enviadoAt,
    enviadoPorNombre: e.enviadoPorNombre,
    createdAt: e.createdAt,
    creadoPorNombre: e.creadoPorNombre,
  };
}

const SIN_PDF = {
  id: true, reportId: true, periodoLabel: true, origen: true, estado: true, motivo: true, asunto: true, mensaje: true,
  destinatarios: true, cc: true, resumen: true, descargadoAt: true, enviadoAt: true, enviadoPorUserId: true,
  enviadoPorNombre: true, createdAt: true, creadoPorUserId: true, creadoPorNombre: true,
};

export async function listEdiciones(reportId) {
  const report = await prisma.reportConfig.findUnique({ where: { id: reportId }, select: { nombre: true } });
  if (!report) throw Object.assign(new Error("Informe no encontrado."), { status: 404 });
  const rows = await prisma.reportEdicion.findMany({ where: { reportId }, orderBy: { createdAt: "desc" }, select: SIN_PDF });
  // "tienePdf" sin traer los bytes: las que no son omitidas/error sí lo tienen.
  return rows.map((e) => toClientEdicion({ ...e, tienePdf: ["por_enviar", "enviado", "guardado"].includes(e.estado) }, report));
}

export async function getEdicion(id) {
  const e = await prisma.reportEdicion.findUnique({ where: { id: Number(id) }, select: { ...SIN_PDF, report: { select: { nombre: true, responsables: true, createdBy: true } } } });
  if (!e) throw Object.assign(new Error("Edición no encontrada."), { status: 404 });
  return toClientEdicion({ ...e, tienePdf: ["por_enviar", "enviado", "guardado"].includes(e.estado) });
}

// Contenido guardado de una edición (para ver una foto tal como quedó, sin recalcular nada).
export async function getEdicionContenido(id) {
  const e = await prisma.reportEdicion.findUnique({ where: { id: Number(id) }, select: { id: true, contenido: true, periodoLabel: true, createdAt: true, creadoPorNombre: true, report: { select: { nombre: true, periodoGeneral: true, contexto: true, bloques: true } } } });
  if (!e || !e.contenido) throw Object.assign(new Error("Esta edición no tiene contenido guardado."), { status: 404 });
  return {
    id: e.id,
    periodoLabel: e.periodoLabel,
    createdAt: e.createdAt,
    creadoPorNombre: e.creadoPorNombre,
    content: parse(e.contenido, null),
    informe: { nombre: e.report?.nombre, periodoGeneral: e.report?.periodoGeneral, contexto: parse(e.report?.contexto, {}), bloques: parse(e.report?.bloques, []) },
  };
}

export async function getEdicionPdf(id, actor) {
  const e = await prisma.reportEdicion.findUnique({ where: { id: Number(id) }, include: { report: { select: { id: true, nombre: true } } } });
  if (!e || !e.pdf) throw Object.assign(new Error("Esta edición no tiene PDF."), { status: 404 });
  if (!e.descargadoAt) {
    await prisma.reportEdicion.update({ where: { id: e.id }, data: { descargadoAt: new Date() } }).catch(() => {});
  }
  await logEdicionDescargada(actor, e.report, e).catch(() => {});
  return { buffer: Buffer.from(e.pdf), filename: nombreArchivo(e.report?.nombre, e.periodoLabel) };
}

export async function marcarEnviada(id, actor) {
  const e = await prisma.reportEdicion.findUnique({ where: { id: Number(id) }, include: { report: { select: { id: true, nombre: true } } } });
  if (!e) throw Object.assign(new Error("Edición no encontrada."), { status: 404 });
  if (e.estado !== "por_enviar") throw Object.assign(new Error("Esta edición no está pendiente de envío."), { status: 400 });
  const upd = await prisma.reportEdicion.update({
    where: { id: e.id },
    data: { estado: "enviado", enviadoAt: new Date(), enviadoPorUserId: actor?.id || null, enviadoPorNombre: actor?.nombre || null },
  });
  await logEdicionEnviada(actor, e.report, upd).catch(() => {});
  return toClientEdicion(upd, e.report);
}

// Ediciones que este usuario tiene por enviar: es responsable del informe (o lo creó, si no tiene responsables).
// Las de prueba solo le aparecen a quien las pidió.
export async function edicionesPorEnviar(user) {
  const rows = await prisma.reportEdicion.findMany({
    where: { estado: "por_enviar" },
    orderBy: { createdAt: "desc" },
    select: { ...SIN_PDF, report: { select: { id: true, nombre: true, responsables: true, createdBy: true, contexto: true } } },
  });
  return rows
    .filter((e) => {
      if (e.origen === "prueba") return e.creadoPorUserId === user.id;
      // Con el aviso desactivado (contexto.avisarMiDia === false) la edición queda solo en el historial.
      if (parse(e.report?.contexto, {}).avisarMiDia === false) return false;
      const resp = parse(e.report?.responsables, []);
      return resp.length ? resp.some((r) => r.id === user.id) : e.report?.createdBy === user.id;
    })
    .map((e) => toClientEdicion({ ...e, tienePdf: true }));
}
