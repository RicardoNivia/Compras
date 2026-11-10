import { prisma } from "@/lib/prisma";
import { listActividades, comentariosDestacados } from "@/lib/actividadesBienestar";
import { resumenParticipacion } from "@/lib/participantesBienestar";
import { hoyColombia } from "@/lib/hoyColombia";
import { createHash } from "node:crypto";
import { generateStructuredJson } from "@/lib/aiStructured";
import { CONECTANDO_CORAZONES_PROPOSITO } from "@/lib/conectandoCorazones";

// Historias de Fundación (Conectando Corazones): cada jornada ya realizada del año contada como presentación, con sus
// fotos, quiénes acompañaron por área, los comentarios a favor (sin autor) y el análisis de Nova. Solo lectura y solo
// cifras que ya existen: no hay datos de beneficiarios, así que no se cuentan.

const realizada = (a, hoy) => (a.estado === "ejecutada" || a.estado === "cerrada") && a.fecha && a.fecha <= hoy;

const clave = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Calificaciones (1-5) que dejaron los participantes y los 4 mejores comentarios a favor (la manito arriba de Nova),
// sin autor. Neutros y en contra solo se cuentan; los motivos de inasistencia (no_aplica) no son opiniones.
async function opiniones(a) {
  const [participantes, notas] = await Promise.all([
    a.aplicaParticipantes
      ? prisma.participanteActividad.findMany({ where: { actividadId: a.id, OR: [{ calificacion: { not: null } }, { observacion: { not: null } }] }, select: { calificacion: true, observacion: true, sentimiento: true } })
      : [],
    prisma.observacionActividad.findMany({ where: { actividadId: a.id }, select: { texto: true, sentimiento: true } }),
  ]);
  const calificadas = participantes.filter((x) => x.calificacion);
  const textos = [
    ...participantes.filter((x) => x.observacion?.trim()).map((x) => ({ texto: x.observacion.trim(), tono: x.sentimiento || "neutro", calificacion: x.calificacion })),
    ...notas.filter((x) => x.texto?.trim()).map((x) => ({ texto: x.texto.trim(), tono: x.sentimiento || "neutro", calificacion: null })),
  ].filter((c) => c.tono !== "no_aplica");
  const vistos = new Set();
  const comentarios = textos
    .filter((c) => c.tono === "positivo")
    .sort((x, y) => (y.calificacion ?? 0) - (x.calificacion ?? 0) || Math.min(y.texto.length, 200) - Math.min(x.texto.length, 200))
    .filter((c) => { const k = clave(c.texto); if (!k || vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 4)
    .map((c) => ({ texto: c.texto.slice(0, 400), tono: c.tono, calificacion: c.calificacion }));
  return {
    calificaciones: {
      total: calificadas.length,
      promedio: calificadas.length ? calificadas.reduce((t, x) => t + x.calificacion, 0) / calificadas.length : null,
      distribucion: [1, 2, 3, 4, 5].map((n) => calificadas.filter((x) => x.calificacion === n).length),
      alCerrar: a.calificacion ?? null,
    },
    comentarios,
    tonos: { aFavor: textos.filter((c) => c.tono === "positivo").length, neutros: textos.filter((c) => c.tono === "neutro").length, enContra: textos.filter((c) => c.tono === "negativo").length },
  };
}

async function jornada(a) {
  const [participacion, fotos, analisis, voces, op] = await Promise.all([
    a.aplicaParticipantes ? resumenParticipacion(a.id) : null,
    prisma.fotoActividad.findMany({ where: { actividadId: a.id }, select: { id: true, descripcion: true, ancho: true, alto: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.analisisActividad.findUnique({ where: { actividadId: a.id }, select: { puntaje: true, titulo: true, resumen: true, tituloHistoria: true, fraseHistoria: true, fraseHistoriaHash: true } }),
    comentariosDestacados([a]),
    opiniones(a),
  ]);
  const inscritos = participacion?.inscritos || a.inscritos || null;
  return {
    id: a.id,
    nombre: a.nombre,
    fecha: a.fecha,
    fechaFin: a.fechaFin,
    descripcion: sinDinero(a.descripcion) || null, // la portada no habla de dinero ni de inventario
    aplicaParticipantes: a.aplicaParticipantes,
    asistentes: a.asistentes,
    inscritos,
    asistencia: inscritos && a.asistentes != null ? a.asistentes / inscritos : null,
    porArea: (participacion?.porArea || []).filter((x) => x.asistieron > 0).sort((x, y) => y.asistieron - x.asistieron).slice(0, 8).map((x) => ({ area: x.area, asistieron: x.asistieron })),
    fotos,
    voces: voces.positivos.map((v) => v.texto),
    vocesAFavor: voces.totalPositivos,
    vocesEnContra: voces.totalNegativos,
    calificaciones: op.calificaciones,
    comentarios: op.comentarios,
    tonos: op.tonos,
    // El análisis técnico (título y resumen, que hablan de presupuesto y gasto) solo sirve de insumo a Nova y no sale al
    // cliente: Historias muestra el título y la frase emocionales que Nova escribe para ella.
    nova: analisis ? { puntaje: analisis.puntaje, titulo: analisis.tituloHistoria, frase: analisis.fraseHistoria, fraseHash: analisis.fraseHistoriaHash, analisis: [analisis.titulo, analisis.resumen] } : null,
  };
}

export async function historiasFundacion(anio) {
  const hoy = hoyColombia();
  const y = Number(anio) || Number(hoy.slice(0, 4));
  const todas = await listActividades({ anio: y, linea: "Fundación" });
  const hechas = todas.filter((a) => realizada(a, hoy));
  const jornadas = await Promise.all(hechas.map(jornada));
  await asegurarFrases(jornadas);

  const destacados = await comentariosDestacados(hechas);
  const porArea = new Map();
  for (const j of jornadas) for (const x of j.porArea) porArea.set(x.area, (porArea.get(x.area) || 0) + x.asistieron);
  const areaTop = [...porArea].filter(([area]) => area !== "Sin área").sort((a, b) => b[1] - a[1])[0];
  const conLista = jornadas.filter((j) => j.inscritos && j.asistentes != null);
  const sumar = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const frase = destacados.positivos[0];

  return {
    anio: y,
    totales: {
      jornadas: jornadas.length,
      personas: sumar(jornadas, (j) => j.asistentes),
      asistencia: sumar(conLista, (j) => j.inscritos) ? sumar(conLista, (j) => j.asistentes) / sumar(conLista, (j) => j.inscritos) : null,
      vocesAFavor: destacados.totalPositivos,
      vocesEnContra: destacados.totalNegativos,
      fotos: sumar(jornadas, (j) => j.fotos.length),
      areaTop: areaTop ? { area: areaTop[0], asistieron: areaTop[1] } : null,
      frase: frase ? { texto: frase.texto, actividad: frase.actividad, fecha: frase.fecha } : null,
    },
    jornadas,
    proximas: todas
      .filter((a) => a.fecha && (a.fechaFin || a.fecha) >= hoy && (a.estado === "creada" || a.estado === "programada"))
      .slice(0, 4)
      .map((a) => ({ id: a.id, nombre: a.nombre, fecha: a.fecha })),
  };
}

// Título y frase de cierre de cada jornada, escritos por Nova y guardados junto a su análisis. Son emocionales: nada de
// gasto, presupuesto, compras ni inventario (las oraciones del análisis que hablan de eso ni siquiera se le pasan). Solo se pide a la IA cuando la
// jornada no tiene frase o cambiaron los datos con que se escribió (huella), y todas las que faltan van en UNA llamada.
// Se guarda con SQL directo para no mover la fecha del análisis (el agente de evaluación la usa para saber qué cambió).
// Sin la parte de apoyo corporativo ni cifras: Historias nunca habla de dinero.
const PROPOSITO = CONECTANDO_CORAZONES_PROPOSITO;

const ESQUEMA_FRASES = {
  type: "OBJECT",
  properties: { frases: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, titulo: { type: "STRING" }, frase: { type: "STRING" } }, required: ["id", "titulo", "frase"] } } },
  required: ["frases"],
};

// Lo que Historias nunca menciona: dinero (presupuesto, gasto, costos, compras) ni inventario.
const DE_DINERO = /presupuest|gast|cost|compra|inventari|pesos|dinero|sobr[oó]|\$/i;
const sinDinero = (t) => (String(t || "").match(/[^.!?]+[.!?]?/g) || []).map((o) => o.trim()).filter((o) => o && !DE_DINERO.test(o)).join(" ");

const huella = (j) => createHash("sha1").update(JSON.stringify(["v3", j.nombre, j.nova?.analisis, j.asistentes, j.comentarios.map((c) => c.texto)])).digest("hex");

async function asegurarFrases(jornadas) {
  const pendientes = jornadas.filter((j) => j.nova && j.nova.fraseHash !== huella(j));
  if (pendientes.length) {
    try {
      const datos = pendientes.map((j) => ({
        id: j.id,
        jornada: j.nombre,
        fecha: j.fecha,
        personasQueAcompanaron: j.asistentes,
        analisisDeNova: j.nova.analisis.map(sinDinero).filter(Boolean).join(". "),
        comentarios: j.comentarios.map((c) => c.texto.slice(0, 200)),
      }));
      const r = await generateStructuredJson({
        systemInstruction: `Eres Nova y escribes la frase con la que cierra la presentación de cada jornada del programa ${PROPOSITO}
Para cada jornada escribe en español:
- "titulo": un título corto (máximo 60 caracteres), emotivo, sobre lo que se vivió en la jornada.
- "frase": UNA frase (entre 90 y 170 caracteres), cálida e inspiradora, que conecte lo que pasó en esa jornada con el propósito del programa (inclusión real, empatía, celebrar la diversidad, aprendizaje mutuo, el poder de estar presentes, transformar vidas una sonrisa a la vez).
Es una presentación sentimental: NUNCA menciones dinero, presupuesto, gasto, costos, compras, inventario ni puntajes. Usa solo lo que dicen los datos: no inventes cifras, nombres, lugares ni actividades y no cuentes beneficiarios. Sin comillas, sin emojis, sin nombres de personas.`,
        prompt: JSON.stringify(datos),
        schema: ESQUEMA_FRASES,
        budgetMs: 25000,
      });
      const limpio = (t, n) => String(t || "").trim().replace(/^["“]|["”]$/g, "").slice(0, n);
      const porId = new Map((r?.frases || []).map((f) => [Number(f.id), { titulo: limpio(f.titulo, 90), frase: limpio(f.frase, 240) }]));
      for (const j of pendientes) {
        const nueva = porId.get(j.id);
        if (!nueva?.frase || DE_DINERO.test(`${nueva.titulo} ${nueva.frase}`)) continue; // si se coló el dinero, no se guarda
        const h = huella(j);
        await prisma.$executeRaw`UPDATE "analisis_actividad" SET "tituloHistoria" = ${nueva.titulo || null}, "fraseHistoria" = ${nueva.frase}, "fraseHistoriaHash" = ${h} WHERE "actividadId" = ${j.id}`;
        j.nova.titulo = nueva.titulo || null;
        j.nova.frase = nueva.frase;
      }
    } catch (e) {
      console.error("[historias] no se pudieron escribir las frases:", e.message);
    }
  }
  for (const j of jornadas) if (j.nova) { delete j.nova.fraseHash; delete j.nova.analisis; }
}
