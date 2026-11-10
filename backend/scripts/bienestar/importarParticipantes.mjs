// Migra los participantes de las actividades de Bienestar 2026 desde la carpeta de Excel del equipo (exportaciones
// de Microsoft Forms, listas de asistencia y la base "Participación Actividades - CONECTANDO CORAZONES").
//
// Uso (desde backend/):
//   node scripts/bienestar/importarParticipantes.mjs <carpeta>               → simula: muestra qué haría (solo conteos)
//   node scripts/bienestar/importarParticipantes.mjs <carpeta> --confirmar   → lo hace
//
// Por pasos, en orden: primero los inscritos de cada actividad (cada archivo a su actividad, por fecha y nombre) y
// después la asistencia (lista maestra del torneo de bolos, listas finales y las "X" / motivos de la base de Fundación). Una persona
// se reconoce por documento o, si no hay, por nombre (sin tildes ni mayúsculas), así correr dos veces no duplica.
// Guarda todos los datos que traen los formularios (incluidos los sensibles; en la app solo los ve editBienestar).
// Los archivos se leen como .xlsx (UTF-8 interno del formato); nada pasa por la consola.
//
// Lo que NO se importa, a propósito: "Halloween … FUNDACIÓN 2" (sus 54 personas ya están en el 1, que es el vigente),
// "BASE ACTIVIDADES" y "BASE INFORME BIENESTAR 2025" (listados de actividades y conteos, sin personas: los usa
// reconstruirLocal.mjs) y el zip de Lagosol (cotizaciones). Las columnas Aportando con el alma, Donación y Visitas de la
// base de Fundación no tienen fecha ni actividad a la cual asociarse.
//
// Listas que marcan asistencia sin decirlo en un encabezado (cuadran con el informe mensual de Bienestar): Bolirana
// "..." = los 60 que jugaron; planilla CSC = los 44 de Corramos; planilla COMPENSAR = los 15 cupos de la carrera.
// De la planilla COMPENSAR solo se toma nombre, documento y asistencia: el resto ya está en el Forms de la carrera.

import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { leerParticipantesExcel, leerAsistencia, normalizarDocumento, buscarPorNombre } from "../../lib/bienestarExcel.js";

const [carpeta] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const confirmar = process.argv.includes("--confirmar");
if (!carpeta) {
  console.error("Uso: node scripts/bienestar/importarParticipantes.mjs <carpeta> [--confirmar]");
  process.exit(1);
}

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// archivo → actividad (fecha + palabra del nombre). opciones: hoja, modo, asistieronTodos, noAsistioSiColumna,
// asistioSiColumna (lo que diga esa columna: OK o Si = asistió, No = no, vacío = sin dato), planillaCompensar.
const PASOS = [
  { archivo: "Actividad 24 de Julio - Conectando Corazones - 2.xlsx", fecha: "2025-07-24", busca: "habilidades", asistioSiColumna: "Firma de Asistencia" },
  { archivo: "Asistencia dia del padre.xlsx", fecha: "2026-06-19", busca: "padre", noAsistioSiColumna: "Columna1" },
  { archivo: "Detalles día del hombre 2026.xlsx", hoja: "Colaboradores Sinco", fecha: "2026-03-19", busca: "hombre", asistieronTodos: true },
  { archivo: "Torneo de Bolos 2026.xlsx", fecha: "2026-06-23", busca: "bolos" },
  { archivo: "Control de Equipos de torneo de bolos 2026 2.xlsx", hoja: "Lista Maestra", fecha: "2026-06-23", busca: "bolos" },
  { archivo: "Carrera Atlética Compensar.xlsx", fecha: "2026-07-05", busca: "carrera" },
  { archivo: "Planilla Inscripción empresarial 2026  - COMPENSAR 1.xlsx", hoja: "Planilla", fecha: "2026-07-05", busca: "carrera", planillaCompensar: true },
  { archivo: "Carrera de la Mujer - Domingo 6 de Septiembre 4.xlsx", hoja: "Sheet1", fecha: "2026-09-06", busca: "mujer" },
  { archivo: "Carrera de la Mujer - Domingo 6 de Septiembre 4.xlsx", hoja: "Hoja1", fecha: "2026-09-06", busca: "mujer" },
  { archivo: "Corramos juntos _Sueños en construcción_ 5.ª edición (1) PARQUE JAIME DUQUE 2.xlsx", fecha: "2026-08-30", busca: "corramos" },
  { archivo: "Corramos juntos _Sueños en construcción_ 5.ª edición (2) - INSCRIPCION COMUNICACIONES.xlsx", fecha: "2026-08-30", busca: "corramos" },
  { archivo: "Planilla de registro grupal CSC 2026 (3).xlsx", fecha: "2026-08-30", busca: "corramos", asistieronTodos: true },
  { archivo: "EXPLOREMOS EL PARQUE JUNTOS -JUNIO 4.xlsx", fecha: "2026-06-04", busca: "parque" },
  { archivo: "Grupos_Torneo_Bolirana_2026.xlsx", hoja: "Hoja1", fecha: "2026-08-20", busca: "bolirana" },
  { archivo: "Grupos_Torneo_Bolirana_2026...xlsx", hoja: "Hoja1", fecha: "2026-08-20", busca: "bolirana", asistieronTodos: true },
  { archivo: "Halloween de sonrisas y fantasía - FUNDACIÓN 29 OCTUBRE 1 conectando corazones.xlsx", fecha: "2026-10-29", busca: "halloween" },
  { archivo: "Me cuido y vivo mejor - 19 de marzo conectando corazones.xlsx", fecha: "2026-03-19", busca: "cuido" },
  { archivo: "Regalemos esperanza a los abuelitos - Limpiemos su casa - Miercoles 23 de abril conectando corazones.xlsx", fecha: "2026-04-23", busca: "abuelitos" },
  { archivo: "Sana-mente  24 de julio ok conectando corazones.xlsx", fecha: "2026-07-24", busca: "sana" },
  { archivo: "¡Dulces, disfraces y magia en_ cada rincón!__Halloween Kids Day.xlsx", fecha: "2026-10-23", busca: "halloween" },
  { archivo: "¡Una noche de suerte escalofriante! HALLOWEEN COLABORADORES.xlsx", fecha: "2026-10-30", busca: "bingo", asistioSiColumna: "Columna1" },
];

// Base de Fundación (hoja BASE 2026): una columna por actividad con "X" (asistió) o "No asisten - motivo".
// noMarcadosNoAsistieron: en las que ya tienen su lista de inscritos, quien no tiene X se marca como no asistió.
const ARCHIVO_FUNDACION = "Participación Actividades - CONECTANDO CORAZONES.xlsx";
const BASES_FUNDACION = [{
  hoja: "BASE 2026",
  columnas: [
    { re: /alimentemos el alma/, fecha: "2026-02-23", busca: "alimentemos" },
    { re: /me cuido y vivo mejor/, fecha: "2026-03-19", busca: "cuido", noMarcadosNoAsistieron: true },
    { re: /regalemos esperanza/, fecha: "2026-04-23", busca: "abuelitos", noMarcadosNoAsistieron: true },
    { re: /^nexus/, fecha: "2026-05-22", busca: "nexus" },
    { re: /exploremos el parque/, fecha: "2026-06-04", busca: "parque" },
    { re: /sana - mente|sana-mente/, fecha: "2026-07-24", busca: "sana", noMarcadosNoAsistieron: true },
    { re: /^lumen/, fecha: "2026-09-25", busca: "lumen" },
  ],
}, {
  // Debajo de las personas trae totales por área, por eso aquí solo cuenta la X.
  hoja: "BASE 2025",
  soloX: true,
  columnas: [
    { re: /^taller de pintura/, fecha: "2025-03-06", busca: "pintura" },
    { re: /^almorcemos/, fecha: "2025-04-10", busca: "abuelitos" },
    { re: /^feria del pueblo/, fecha: "2025-06-07", busca: "pueblo" },
    { re: /^desarrollando/, fecha: "2025-07-24", busca: "habilidades" },
    { re: /^evento/, fecha: "2025-09-26", busca: "evento" },
    { re: /^halloween/, fecha: "2025-10-30", busca: "halloween" },
    { re: /^ayudar/, fecha: "2025-11-13", busca: "ayudar" },
  ],
}];

const prisma = new PrismaClient();
const resumen = [];

async function actividadDe(fecha, busca) {
  const lista = await prisma.actividadBienestar.findMany({ where: { fecha } });
  const a = lista.find((x) => sinTildes(x.nombre).includes(busca));
  if (!a) throw new Error(`No encontré la actividad del ${fecha} con "${busca}" en el nombre.`);
  return a;
}

// En la simulación nada se escribe: lo que "se habría creado" se guarda aquí para que los pasos siguientes
// (asistencia) lo encuentren, igual que pasaría en la migración real.
const simulados = new Map(); // actividadId → filas simuladas

// Misma regla que lib/participantesBienestar.js#aplicarParticipantes (allá con el cliente de la app).
async function aplicar(actividad, lista, { modo = "inscripcion", noMarcadosNoAsistieron = false } = {}) {
  if (!simulados.has(actividad.id)) simulados.set(actividad.id, []);
  const existentes = [...(await prisma.participanteActividad.findMany({ where: { actividadId: actividad.id } })), ...simulados.get(actividad.id)];
  const porDoc = new Map(existentes.filter((p) => p.documento).map((p) => [p.documento, p]));
  const porNombre = new Map(existentes.map((p) => [sinTildes(p.nombre), p]));
  const vistos = new Set();
  const r = { leidos: lista.length, creados: 0, actualizados: 0, sinCoincidencia: 0, marcadosNo: 0 };
  for (const p of lista) {
    const actual = (p.documento && porDoc.get(p.documento)) || porNombre.get(sinTildes(p.nombre)) || buscarPorNombre([...porNombre.values()].filter((x) => !vistos.has(x.id)), p.nombre);
    if (actual) {
      vistos.add(actual.id);
      const data = {};
      if (p.asistio !== null && p.asistio !== undefined) { data.asistio = p.asistio; data.motivoInasistencia = p.asistio ? null : p.motivoInasistencia || actual.motivoInasistencia; }
      if (!actual.documento && p.documento) data.documento = p.documento;
      if (!actual.area && p.area) data.area = p.area;
      if (!actual.calificacion && p.calificacion) data.calificacion = p.calificacion;
      if (p.observacion && !actual.observacion) { data.observacion = p.observacion; data.sentimiento = null; }
      if (p.datos && Object.keys(p.datos).length) data.datos = JSON.stringify({ ...(actual.datos ? JSON.parse(actual.datos) : {}), ...p.datos });
      if (Object.keys(data).length) {
        if (confirmar) await prisma.participanteActividad.update({ where: { id: actual.id }, data });
        Object.assign(actual, data);
        r.actualizados++;
      }
    } else if (modo === "inscripcion") {
      const data = {
        actividadId: actividad.id, nombre: p.nombre.slice(0, 200), documento: p.documento, area: p.area,
        inscrito: true, asistio: p.asistio ?? null, motivoInasistencia: p.asistio === false ? p.motivoInasistencia : null,
        calificacion: p.calificacion, observacion: p.observacion,
        datos: p.datos && Object.keys(p.datos).length ? JSON.stringify(p.datos) : null,
        origen: "importacion", creadoPorNombre: "Importación Excel",
      };
      const row = confirmar ? await prisma.participanteActividad.create({ data }) : { ...data, id: `simulado-${actividad.id}-${simulados.get(actividad.id).length}` };
      if (!confirmar) simulados.get(actividad.id).push(row);
      vistos.add(row.id);
      if (row.documento) porDoc.set(row.documento, row);
      porNombre.set(sinTildes(row.nombre), row);
      r.creados++;
    } else {
      r.sinCoincidencia++;
    }
  }
  if (noMarcadosNoAsistieron) {
    const pendientes = [...porNombre.values()].filter((p) => p.inscrito !== false && (p.asistio === null || p.asistio === undefined) && !vistos.has(p.id));
    if (confirmar && pendientes.length) {
      await prisma.participanteActividad.updateMany({ where: { id: { in: pendientes.map((p) => p.id).filter(Number.isInteger) } }, data: { asistio: false } });
    }
    r.marcadosNo = pendientes.length;
  }
  return r;
}

async function sincronizarConteos(actividadId) {
  const [inscritos, asistentes, total, conAsistencia] = await Promise.all([
    prisma.participanteActividad.count({ where: { actividadId, inscrito: true } }),
    prisma.participanteActividad.count({ where: { actividadId, asistio: true } }),
    prisma.participanteActividad.count({ where: { actividadId } }),
    prisma.participanteActividad.count({ where: { actividadId, asistio: { not: null } } }),
  ]);
  if (!total) return null;
  const antes = await prisma.actividadBienestar.findUnique({ where: { id: actividadId }, select: { nombre: true, inscritos: true, asistentes: true } });
  await prisma.actividadBienestar.update({ where: { id: actividadId }, data: conAsistencia ? { inscritos, asistentes } : { inscritos } });
  // Con la actividad como recordId, para que el agente de evaluación vea el cambio.
  if (antes.inscritos !== inscritos || (conAsistencia && antes.asistentes !== asistentes)) {
    await prisma.auditLog.create({
      data: { action: "importar", entityType: "participante", recordId: String(actividadId), recordInfo: `${antes.nombre}: de ${antes.inscritos ?? "—"} a ${inscritos} inscritos y de ${antes.asistentes ?? "—"} a ${conAsistencia ? asistentes : antes.asistentes ?? "—"} asistentes (migración desde Excel)`, userNombre: "Importación Excel" },
    });
  }
  return { inscritos, asistentes: conAsistencia ? asistentes : "(sin cambio)" };
}

// Planilla de la caja: el encabezado no está en la primera fila y separa nombres de apellidos.
function leerPlanillaCompensar(buffer, nombreHoja) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, raw: false, defval: "" });
  const hdr = filas.findIndex((f) => f.some((c) => sinTildes(c) === "numero de documento"));
  const enc = filas[hdr].map(sinTildes);
  const [iDoc, iNom, iApe] = ["numero de documento", "nombres completos", "apellidos completos"].map((h) => enc.indexOf(h));
  return filas.slice(hdr + 1).filter((f) => String(f[iNom]).trim() && normalizarDocumento(f[iDoc])).map((f) => ({
    nombre: `${f[iNom]} ${f[iApe]}`.replace(/\s+/g, " ").trim(), documento: normalizarDocumento(f[iDoc]),
    area: null, asistio: true, motivoInasistencia: null, calificacion: null, observacion: null, datos: {},
  }));
}

// Columna por encabezado (sin tildes), para las opciones que miran una columna puntual.
function valoresDeColumna(buffer, hoja, encabezado) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja || wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const hdr = filas.findIndex((r) => r.filter((c) => String(c).trim()).length >= 3);
  const i = filas[hdr].findIndex((h) => sinTildes(h) === sinTildes(encabezado));
  return filas.slice(hdr + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => String(r[i] ?? "").trim());
}

try {
  const tocadas = new Set();

  for (const paso of PASOS) {
    const ruta = path.join(carpeta, paso.archivo);
    if (!fs.existsSync(ruta)) { resumen.push(`- ${paso.archivo}: no está en la carpeta, se omite`); continue; }
    const actividad = await actividadDe(paso.fecha, paso.busca);
    const buffer = fs.readFileSync(ruta);
    const { participantes, hoja } = paso.planillaCompensar ? { participantes: leerPlanillaCompensar(buffer, paso.hoja), hoja: paso.hoja } : leerParticipantesExcel(buffer, { hoja: paso.hoja });
    if (paso.asistieronTodos) for (const p of participantes) if (p.asistio === null) p.asistio = true;
    if (paso.asistioSiColumna) {
      const vals = valoresDeColumna(buffer, hoja, paso.asistioSiColumna);
      participantes.forEach((p, i) => { if (p.asistio === null) p.asistio = leerAsistencia(vals[i]).asistio; });
    }
    if (paso.noAsistioSiColumna) {
      const vals = valoresDeColumna(buffer, hoja, paso.noAsistioSiColumna);
      participantes.forEach((p, i) => {
        if (p.asistio !== null) return;
        const v = vals[i];
        if (v) { const a = leerAsistencia(v.startsWith("No") ? v : `No ${v}`); p.asistio = false; p.motivoInasistencia = a.motivo; p.observacion = [p.observacion, v].filter(Boolean).join(" · "); }
        else p.asistio = true;
      });
    }
    const r = await aplicar(actividad, participantes, { modo: paso.modo });
    tocadas.add(actividad.id);
    resumen.push(`- ${actividad.nombre} (${actividad.fecha}) ← ${paso.archivo} [${hoja}, ${paso.modo || "inscripcion"}]: ${r.leidos} leídos, ${r.creados} nuevos, ${r.actualizados} actualizados${r.sinCoincidencia ? `, ${r.sinCoincidencia} sin coincidencia` : ""}`);
  }

  // Base de Fundación: "X" = asistió; "No asisten - motivo" = no asistió con su motivo.
  const rutaBase = path.join(carpeta, ARCHIVO_FUNDACION);
  if (fs.existsSync(rutaBase)) for (const BASE_FUNDACION of BASES_FUNDACION) {
    const wb = XLSX.read(fs.readFileSync(rutaBase), { type: "buffer" });
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[BASE_FUNDACION.hoja], { header: 1, raw: false, defval: "" });
    const enc = filas[0].map((h) => sinTildes(h));
    const iNombre = enc.findIndex((h) => h === "nombre completo");
    const iDoc = enc.findIndex((h) => h === "identificacion");
    const iArea = enc.findIndex((h) => h === "area");
    const personas = filas.slice(1).filter((r) => String(r[iNombre] ?? "").trim() && isNaN(Number(r[iNombre])));
    for (const col of BASE_FUNDACION.columnas) {
      const i = enc.findIndex((h) => col.re.test(h));
      if (i < 0) { resumen.push(`- Base Fundación: no encontré la columna de "${col.busca}"`); continue; }
      const actividad = await actividadDe(col.fecha, col.busca);
      const lista = [];
      for (const r of personas) {
        const v = String(r[i] ?? "").trim();
        if (!v || (BASE_FUNDACION.soloX && !/^x$/i.test(v))) continue;
        const a = /^x$/i.test(v) ? { asistio: true, motivo: null } : leerAsistencia(v);
        if (a.asistio === null) continue;
        lista.push({
          nombre: String(r[iNombre]).replace(/\s+/g, " ").trim(), documento: normalizarDocumento(r[iDoc]),
          area: String(r[iArea] ?? "").trim().toUpperCase() || null, asistio: a.asistio, motivoInasistencia: a.motivo,
          observacion: a.asistio === false ? v : null, calificacion: null, datos: {},
        });
      }
      // La base es el registro de asistencia: quien tiene X participó aunque no esté en el Forms (se crea).
      const modo = "inscripcion";
      const r = await aplicar(actividad, lista, { modo, noMarcadosNoAsistieron: !!col.noMarcadosNoAsistieron });
      tocadas.add(actividad.id);
      resumen.push(`- ${actividad.nombre} (${actividad.fecha}) ← Base Fundación [${modo}]: ${r.leidos} con marca, ${r.creados} nuevos, ${r.actualizados} actualizados${r.sinCoincidencia ? `, ${r.sinCoincidencia} sin coincidencia en la lista de inscritos` : ""}${r.marcadosNo ? `, ${r.marcadosNo} inscritos sin X → no asistieron` : ""}`);
    }
  }

  if (confirmar) {
    resumen.push("", "Conteos de las actividades actualizados:");
    for (const id of tocadas) {
      const c = await sincronizarConteos(id);
      const a = await prisma.actividadBienestar.findUnique({ where: { id }, select: { nombre: true } });
      if (c) resumen.push(`  · ${a.nombre}: ${c.inscritos} inscritos, ${c.asistentes} asistentes`);
    }
    await prisma.auditLog.create({
      data: { action: "importar", entityType: "participante", recordId: "migracion-participantes-2026", recordInfo: `Migración de participantes de Bienestar 2026 desde Excel (${tocadas.size} actividades)`, userNombre: "Importación Excel" },
    });
  }
  console.log(`${confirmar ? "MIGRACIÓN" : "SIMULACIÓN (agrega --confirmar para escribir)"}\n${resumen.join("\n")}`);
} finally {
  await prisma.$disconnect();
}
