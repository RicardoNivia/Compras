import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generarAnalisisActividad } from "@/lib/analisisActividad";
import { generarAnalisis } from "@/lib/analisisBienestar";
import { logAgenteEvaluacion } from "@/lib/audit";

// Agente de evaluación de actividades: vuelve a calificar con Nova SOLO las actividades que cambiaron después de su última
// calificación, y al terminar actualiza los análisis de los dashboards afectados. Qué cambió lo dice Auditoría: entradas
// posteriores a la calificación sobre la actividad, sus participantes, su inventario o sus compras. Lo que no influye en
// la calificación (fotos, responsable, formulario) no cuenta, para no gastar IA sin sentido.
// Es costoso y puede tardar: corre en segundo plano, de a uno por servidor, y el usuario lo confirma antes (el POST exige
// confirmar) con la lista de lo que se va a reevaluar. El estado vive en memoria, igual que lib/reportJobs.js.

const CONCURRENCIA = 2;
const ENTIDADES = ["actividad", "participante", "inventario", "observacionActividad", "record"];
// Campos de la actividad y de sus compras que Nova tiene en cuenta (ver analisisActividad.js#datosParaNova).
const CAMPOS_ACTIVIDAD = new Set(["nombre", "fecha", "fechaFin", "descripcion", "presupuesto", "aplicaParticipantes", "inscritos", "asistentes", "calificacion", "comentarioCierre", "observaciones"]);
const CAMPOS_COMPRA = new Set(["actividad", "actividadId", "descripcion", "proveedor", "valorConIva", "estadoLegalizacion"]);
const MOTIVOS = { actividad: "datos de la actividad", participante: "participantes", inventario: "inventario", observacionActividad: "observaciones", record: "compras" };

const badRequest = (msg, status = 400) => Object.assign(new Error(msg), { status });
const estadoGlobal = () => (globalThis.__agenteEvaluacion ||= { trabajo: null });

function camposDe(entrada) {
  try {
    return JSON.parse(entrada.changes || "[]");
  } catch {
    return [];
  }
}

// Las actividades ya realizadas de estas líneas que cambiaron después de su calificación, o que nunca se calificaron.
export async function pendientesDeEvaluacion(lineas) {
  const actividades = await prisma.actividadBienestar.findMany({
    where: { estado: { in: ["ejecutada", "cerrada"] }, linea: { in: lineas } },
    select: { id: true, nombre: true, fecha: true, linea: true, analisisNova: { select: { puntaje: true, updatedAt: true } } },
    orderBy: { fecha: "desc" },
  });
  const calificadas = actividades.filter((a) => a.analisisNova);
  const cambios = new Map(); // id de actividad -> { entidad -> { n, ultima } }
  if (calificadas.length) {
    const desde = new Date(Math.min(...calificadas.map((a) => a.analisisNova.updatedAt.getTime())));
    const entradas = await prisma.auditLog.findMany({
      where: { entityType: { in: ENTIDADES }, createdAt: { gt: desde } },
      select: { entityType: true, recordId: true, action: true, changes: true, createdAt: true },
    });
    const ids = new Set(calificadas.map((a) => a.id));
    const compras = await prisma.record.findMany({
      where: { id: { in: entradas.filter((e) => e.entityType === "record").map((e) => e.recordId) }, actividadId: { in: [...ids] } },
      select: { id: true, actividadId: true },
    });
    const actividadDeCompra = new Map(compras.map((c) => [c.id, c.actividadId]));
    const anotar = (id, entrada) => {
      if (!ids.has(id)) return;
      const porEntidad = cambios.get(id) || {};
      const previo = porEntidad[entrada.entityType] || { n: 0, ultima: entrada.createdAt };
      porEntidad[entrada.entityType] = { n: previo.n + 1, ultima: entrada.createdAt > previo.ultima ? entrada.createdAt : previo.ultima };
      cambios.set(id, porEntidad);
    };
    const calificadaEl = new Map(calificadas.map((a) => [a.id, a.analisisNova.updatedAt]));
    for (const e of entradas) {
      const campos = camposDe(e);
      const destinos = new Set();
      if (e.entityType === "record") {
        // Si la compra se asoció, se quitó o se eliminó, cuenta para la actividad de antes y para la de ahora.
        if (!campos.some((c) => CAMPOS_COMPRA.has(c.field))) continue;
        if (actividadDeCompra.has(e.recordId)) destinos.add(actividadDeCompra.get(e.recordId));
        for (const c of campos) {
          if (c.field !== "actividadId") continue;
          if (Number(c.before)) destinos.add(Number(c.before));
          if (Number(c.after)) destinos.add(Number(c.after));
        }
      } else {
        if (e.entityType === "actividad" && !campos.some((c) => CAMPOS_ACTIVIDAD.has(c.field))) continue;
        destinos.add(Number(e.recordId));
      }
      for (const id of destinos) if (calificadaEl.has(id) && e.createdAt > calificadaEl.get(id)) anotar(id, e);
    }
  }
  const lista = [];
  for (const a of actividades) {
    const c = cambios.get(a.id);
    if (a.analisisNova && !c) continue;
    lista.push({
      id: a.id, nombre: a.nombre, fecha: a.fecha, linea: a.linea, puntajeActual: a.analisisNova?.puntaje ?? null,
      motivos: c ? Object.entries(c).map(([k, v]) => `${v.n} cambio(s) en ${MOTIVOS[k]}`) : ["Aún no tiene calificación de Nova"],
      ultimoCambio: c ? new Date(Math.max(...Object.values(c).map((v) => v.ultima.getTime()))) : null,
    });
  }
  return lista;
}

// Los análisis de dashboard que se actualizan al final: el del mes de cada actividad y el general de su año, por línea.
function dashboardsAfectados(lista) {
  const claves = new Map();
  for (const a of lista) {
    if (!a.fecha) continue;
    const anio = Number(a.fecha.slice(0, 4));
    const mes = Number(a.fecha.slice(5, 7));
    claves.set(`${a.linea}|${anio}|${mes}`, { linea: a.linea, anio, mes });
    claves.set(`${a.linea}|${anio}|0`, { linea: a.linea, anio, mes: 0 });
  }
  return [...claves.values()];
}

export async function vistaPrevia(lineas) {
  const trabajo = estadoGlobal().trabajo;
  if (trabajo?.estado === "corriendo") return { trabajo: publico(trabajo), pendientes: [], dashboards: 0 };
  const pendientes = await pendientesDeEvaluacion(lineas);
  return { trabajo: null, pendientes, dashboards: dashboardsAfectados(pendientes).length };
}

function publico(t) {
  return {
    id: t.id, estado: t.estado, fase: t.fase, total: t.total, hechas: t.hechas, actual: t.actual, resultados: t.resultados,
    errores: t.errores, dashboards: t.dashboards, dashboardsHechos: t.dashboardsHechos, iniciadoPor: t.iniciadoPor, inicio: t.inicio, fin: t.fin, detenido: t.detener,
  };
}

export function estadoTrabajo() {
  const t = estadoGlobal().trabajo;
  return t ? publico(t) : null;
}

export function detenerTrabajo(actor) {
  const t = estadoGlobal().trabajo;
  if (!t || t.estado !== "corriendo") throw badRequest("No hay ninguna evaluación en curso.", 409);
  t.detener = true;
  logAgenteEvaluacion(actor, t.id, "Pidió detener la reevaluación").catch(() => {});
  return publico(t);
}

async function ejecutar(t, lista, actor) {
  const cola = [...lista];
  const evaluadas = [];
  t.actual = [];
  const trabajador = async () => {
    while (cola.length && !t.detener) {
      const a = cola.shift();
      t.actual.push(a.nombre);
      try {
        const r = await generarAnalisisActividad(a.id, { actor, origen: "agente" });
        t.resultados.push({ id: a.id, nombre: a.nombre, antes: a.puntajeActual, despues: r.puntaje, titulo: r.titulo });
        evaluadas.push(a);
      } catch (e) {
        t.errores.push(`${a.nombre}: ${e.message}`);
      }
      t.hechas++;
      t.actual = t.actual.filter((n) => n !== a.nombre);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));

  // Solo se actualizan los dashboards de lo que sí se reevaluó.
  t.fase = "dashboards";
  const dashboards = dashboardsAfectados(evaluadas);
  t.dashboards = dashboards.length;
  for (const d of dashboards) {
    if (t.detener) break;
    t.actual = [d.mes ? `Análisis de ${d.linea}, ${d.anio}-${String(d.mes).padStart(2, "0")}` : `Análisis general de ${d.linea}, ${d.anio}`];
    try {
      await generarAnalisis({ ...d, actor, origen: "manual" });
      t.dashboardsHechos++;
    } catch (e) {
      t.errores.push(`${t.actual[0]}: ${e.message}`);
    }
  }
  t.actual = [];
  t.estado = "terminado";
  t.fin = new Date();
  logAgenteEvaluacion(actor, t.id, `${t.detener ? "Detuvo" : "Terminó"} la reevaluación: ${t.resultados.length} de ${t.total} actividades y ${t.dashboardsHechos} análisis de dashboard${t.errores.length ? `, ${t.errores.length} con error` : ""}`).catch(() => {});
}

// Todas las realizadas, con o sin cambios (lo usa lib/agenteDespliegue.js una vez por despliegue).
async function todasLasEvaluables(lineas) {
  const actividades = await prisma.actividadBienestar.findMany({
    where: { estado: { in: ["ejecutada", "cerrada"] }, linea: { in: lineas } },
    select: { id: true, nombre: true, fecha: true, linea: true, analisisNova: { select: { puntaje: true } } },
    orderBy: { fecha: "desc" },
  });
  return actividades.map((a) => ({ id: a.id, nombre: a.nombre, fecha: a.fecha, linea: a.linea, puntajeActual: a.analisisNova?.puntaje ?? null, motivos: ["Recalificación al desplegar"], ultimoCambio: null }));
}

// Exige confirmar: el aviso de costo se muestra antes. No hace nada si ya hay una en curso o no hay nada que reevaluar.
// todas: recalifica todas las realizadas, no solo las que cambiaron.
export async function iniciarTrabajo(lineas, { confirmar, todas = false }, actor) {
  if (confirmar !== true) throw badRequest("Confirma que aceptas el costo en IA antes de iniciar la evaluación.");
  const global = estadoGlobal();
  if (global.trabajo?.estado === "corriendo") throw badRequest("Ya hay una evaluación en curso.", 409);
  const lista = todas ? await todasLasEvaluables(lineas) : await pendientesDeEvaluacion(lineas);
  if (!lista.length) throw badRequest("No hay actividades con cambios para reevaluar.", 409);
  const t = {
    id: randomUUID(), estado: "corriendo", fase: "actividades", total: lista.length, hechas: 0, actual: [], resultados: [], errores: [],
    dashboards: 0, dashboardsHechos: 0, iniciadoPor: actor?.nombre || null, inicio: new Date(), fin: null, detener: false,
  };
  global.trabajo = t;
  logAgenteEvaluacion(actor, t.id, `Inició la reevaluación de ${lista.length} actividad(es) ${todas ? "(todas, al desplegar)" : "con cambios"}`).catch(() => {});
  ejecutar(t, lista, actor).catch((e) => {
    t.errores.push(e.message);
    t.estado = "terminado";
    t.fin = new Date();
  });
  return publico(t);
}
