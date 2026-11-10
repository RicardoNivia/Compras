import { prisma } from "@/lib/prisma";
import { generateReportContent } from "@/lib/reportContent";
import { opcionesDe } from "@/lib/reportEdiciones";
import { periodoLabel } from "@/lib/reportSchedule";

// Informes "solo para consultar" (contexto.proposito === "consulta"): no se programan ni se envían; los ven en la app
// (menú "Ver informes") quien los creó, los administradores y las personas a las que se les dio acceso
// (contexto.acceso = [{ id, nombre }]). Verlos NO requiere el permiso de Informes: el acceso es por informe.

function parse(v, fallback) {
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

export function esConsulta(report) {
  return report?.tipo === "estudio" && parse(report.contexto, {}).proposito === "consulta";
}

export function puedeVer(report, user) {
  if (!user || !esConsulta(report)) return false;
  if (user.role === "admin" || report.createdBy === user.id) return true;
  return (parse(report.contexto, {}).acceso || []).some((a) => a.id === user.id);
}

function resumen(r) {
  const ctx = parse(r.contexto, {});
  return {
    id: r.id,
    nombre: r.nombre,
    periodoGeneral: r.periodoGeneral,
    periodoLabel: periodoLabel(r.periodoGeneral),
    audiencia: ctx.audiencia || null,
    creadoPor: r.createdByNombre || null,
    actualizadoAt: r.updatedAt,
    secciones: (() => { try { return JSON.parse(r.bloques || "[]").length; } catch { return 0; } })(),
  };
}

export async function listCompartidos(user) {
  const rows = await prisma.reportConfig.findMany({ where: { tipo: "estudio" }, orderBy: { nombre: "asc" } });
  return rows.filter((r) => puedeVer(r, user)).map(resumen);
}

export async function getCompartido(id, user) {
  const r = await prisma.reportConfig.findUnique({ where: { id } });
  if (!r || !puedeVer(r, user)) throw Object.assign(new Error("No tienes acceso a este informe."), { status: 403 });
  return { report: r, resumen: { ...resumen(r), bloques: parse(r.bloques, []), contexto: parse(r.contexto, {}) } };
}

// Contenido del informe con los datos de hoy (lo que ve la persona con acceso).
export async function contenidoCompartido(report) {
  // Sin IA: las cifras se recalculan con los datos de hoy y el texto de Nova es el que se guardó al diseñarlo.
  return generateReportContent({ ...opcionesDe(report).contenido, sinIa: true });
}
