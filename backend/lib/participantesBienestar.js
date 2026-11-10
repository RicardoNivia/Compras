import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isRoleAllowed } from "@/lib/permissions";
import { leerParticipantesExcel, normalizarDocumento, buscarPorNombre } from "@/lib/bienestarExcel";
import { logParticipantes, logFormularioActividad } from "@/lib/audit";
import { areaDelCatalogo, motivoDelCatalogo, valoresActivos, resolvedoresImportacion } from "@/lib/catalogosBienestar";
import { clasificarEnSegundoPlano } from "@/lib/sentimientoComentarios";

// Participantes de las actividades de Bienestar: inscritos (formulario público, Excel de Forms o a mano) y su
// asistencia. Con participantes, los conteos de la actividad (inscritos / asistentes) salen de aquí.
// Los datos sensibles (salud, EPS, tipo de sangre, contactos de emergencia, menores…) que traen los formularios solo
// los ve quien tiene editBienestar; al resto se le ocultan.

// Campos propios de cada tipo de actividad para el formulario público (las plantillas que se vieron en los Forms).
export const PLANTILLAS_FORMULARIO = {
  general: { nombre: "General", campos: [] },
  carrera: {
    nombre: "Carrera",
    campos: [
      { clave: "distancia", etiqueta: "Distancia", tipo: "opcion", opciones: ["3K", "5K", "10K", "15K", "21K"], obligatorio: true },
      { clave: "talla", etiqueta: "Talla de camiseta", tipo: "opcion", opciones: ["XS", "S", "M", "L", "XL"], obligatorio: true },
      { clave: "genero", etiqueta: "Género", tipo: "opcion", opciones: ["Femenino", "Masculino"], obligatorio: true },
      { clave: "fechaNacimiento", etiqueta: "Fecha de nacimiento", tipo: "fecha", obligatorio: true, sensible: true },
      { clave: "tipoSangre", etiqueta: "Tipo de sangre y RH", tipo: "texto", obligatorio: true, sensible: true },
      { clave: "eps", etiqueta: "EPS", tipo: "texto", obligatorio: true, sensible: true },
      { clave: "antecedentes", etiqueta: "Antecedentes de salud o lesiones", tipo: "parrafo", sensible: true },
      { clave: "contactoEmergencia", etiqueta: "Contacto de emergencia (nombre y celular)", tipo: "texto", obligatorio: true, sensible: true },
    ],
  },
  torneo: {
    nombre: "Torneo",
    campos: [
      { clave: "genero", etiqueta: "Género", tipo: "opcion", opciones: ["Mujer", "Hombre"], obligatorio: true },
    ],
  },
  familiar: {
    nombre: "Familiar (con acompañantes o hijos)",
    campos: [
      { clave: "acompanantes", etiqueta: "¿Cuántos acompañantes llevas?", tipo: "numero" },
      { clave: "hijos", etiqueta: "Nombres de tus hijos (separados por comas)", tipo: "texto", sensible: true },
      { clave: "edadesHijos", etiqueta: "Edades de tus hijos", tipo: "texto" },
      { clave: "saludHijos", etiqueta: "Condición de salud, alergia o recomendación de tus hijos", tipo: "parrafo", sensible: true },
      { clave: "transporte", etiqueta: "¿Usarás el transporte de Sinco?", tipo: "si_no" },
    ],
  },
  fundacion: {
    nombre: "Fundación",
    campos: [
      { clave: "lider", etiqueta: "Líder de tu área", tipo: "texto" },
      { clave: "transporte", etiqueta: "¿Usarás el transporte de Sinco?", tipo: "si_no" },
    ],
  },
};

const SENSIBLE = /sangre|eps|salud|antecedente|lesion|emergencia|pariente|nacimiento|hijo|alergi|condici|direcci|tel[eé]fono|celular|correo/i;

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const parse = (s, def) => { try { return s ? JSON.parse(s) : def; } catch { return def; } };
const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function camposSensibles(actividad) {
  return new Set(parse(actividad?.formularioCampos, []).filter((c) => c.sensible).map((c) => c.etiqueta));
}

export function toClientParticipante(p, { verSensibles = false, sensibles = new Set() } = {}) {
  const datos = parse(p.datos, {});
  const visibles = {};
  let ocultos = 0;
  for (const [k, v] of Object.entries(datos)) {
    if (!verSensibles && (sensibles.has(k) || SENSIBLE.test(k))) { ocultos++; continue; }
    visibles[k] = v;
  }
  return {
    id: p.id,
    actividadId: p.actividadId,
    nombre: p.nombre,
    documento: verSensibles ? p.documento : p.documento ? `••••${p.documento.slice(-3)}` : null,
    area: p.area,
    correo: verSensibles ? p.correo : null,
    inscrito: p.inscrito,
    asistio: p.asistio,
    motivoInasistencia: p.motivoInasistencia,
    calificacion: p.calificacion,
    observacion: p.observacion,
    sentimiento: p.sentimiento,
    datos: visibles,
    datosOcultos: ocultos,
    origen: p.origen,
    autorizaDatos: p.autorizaDatos,
    createdAt: p.createdAt,
    creadoPorNombre: p.creadoPorNombre,
  };
}

async function actividadOError(id) {
  const a = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) } });
  if (!a) throw badRequest("Actividad no encontrada.", 404);
  return a;
}

// Una actividad cerrada ya no se modifica en nada.
async function actividadEditable(id) {
  const a = await actividadOError(id);
  if (a.estado === "cerrada") throw badRequest("La actividad está cerrada: ya no se puede modificar.", 409);
  return a;
}

// Los conteos de la actividad salen de sus participantes (si tiene): inscritos = filas inscritas, asistentes = asistió.
// Los asistentes solo se recalculan si ya hay asistencia registrada (asistió o no asistió): con una lista que solo
// trae inscripciones no se borra el número de asistentes que ya tenía la actividad.
export async function sincronizarConteos(actividadId) {
  const [inscritos, asistentes, total, conAsistencia] = await Promise.all([
    prisma.participanteActividad.count({ where: { actividadId, inscrito: true } }),
    prisma.participanteActividad.count({ where: { actividadId, asistio: true } }),
    prisma.participanteActividad.count({ where: { actividadId } }),
    prisma.participanteActividad.count({ where: { actividadId, asistio: { not: null } } }),
  ]);
  if (!total) return;
  await prisma.actividadBienestar.update({ where: { id: actividadId }, data: conAsistencia ? { inscritos, asistentes } : { inscritos } });
}

export async function listParticipantes(actividadId, actor) {
  const actividad = await actividadOError(actividadId);
  const verSensibles = await isRoleAllowed(actor.role, actividad.linea === "Fundación" ? "editFundacion" : "editBienestar");
  const rows = await prisma.participanteActividad.findMany({ where: { actividadId: actividad.id }, orderBy: [{ nombre: "asc" }] });
  const sensibles = camposSensibles(actividad);
  return rows.map((p) => toClientParticipante(p, { verSensibles, sensibles }));
}

// Resumen de participación de una actividad: totales, por área y por motivo de inasistencia.
export async function resumenParticipacion(actividadId) {
  const rows = await prisma.participanteActividad.findMany({ where: { actividadId: Number(actividadId) }, select: { area: true, inscrito: true, asistio: true, motivoInasistencia: true, calificacion: true } });
  const porArea = new Map();
  const motivos = new Map();
  for (const r of rows) {
    const k = r.area || "Sin área";
    const a = porArea.get(k) || { area: k, inscritos: 0, asistieron: 0, noAsistieron: 0 };
    if (r.inscrito) a.inscritos++;
    if (r.asistio === true) a.asistieron++;
    if (r.asistio === false) {
      a.noAsistieron++;
      const m = r.motivoInasistencia || "Sin motivo registrado";
      motivos.set(m, (motivos.get(m) || 0) + 1);
    }
    porArea.set(k, a);
  }
  const calif = rows.filter((r) => r.calificacion);
  return {
    total: rows.length,
    inscritos: rows.filter((r) => r.inscrito).length,
    asistieron: rows.filter((r) => r.asistio === true).length,
    noAsistieron: rows.filter((r) => r.asistio === false).length,
    sinRegistrar: rows.filter((r) => r.asistio === null).length,
    calificacionPromedio: calif.length ? calif.reduce((s, r) => s + r.calificacion, 0) / calif.length : null,
    calificaciones: calif.length,
    porArea: [...porArea.values()].sort((a, b) => b.inscritos - a.inscritos),
    motivos: [...motivos].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n),
  };
}

function leerParticipante(body, { parcial = false } = {}) {
  const data = {};
  const viene = (k) => !parcial || k in body;
  if (viene("nombre")) {
    data.nombre = String(body.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!data.nombre) throw badRequest("El nombre es obligatorio.");
  }
  if (viene("documento")) data.documento = body.documento ? normalizarDocumento(body.documento) : null;
  if (viene("documento") && body.documento && !data.documento) throw badRequest("El documento debe tener solo números (5 a 15 dígitos).");
  if (viene("area")) data.area = String(body.area ?? "").trim().toUpperCase().slice(0, 120) || null;
  if (viene("correo")) data.correo = String(body.correo ?? "").trim().slice(0, 200) || null;
  if (viene("inscrito")) data.inscrito = body.inscrito !== false;
  if (viene("asistio")) data.asistio = body.asistio === true ? true : body.asistio === false ? false : null;
  if (viene("motivoInasistencia")) data.motivoInasistencia = body.motivoInasistencia || null;
  if (data.asistio === true) data.motivoInasistencia = null;
  if (viene("calificacion")) {
    const n = body.calificacion == null || body.calificacion === "" ? null : Number(body.calificacion);
    if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 5)) throw badRequest("La calificación va de 1 a 5.");
    data.calificacion = n;
  }
  if (viene("observacion")) data.observacion = String(body.observacion ?? "").trim().slice(0, 1000) || null;
  return data;
}

// Área y motivo van por maestro: se validan contra el catálogo y se guarda el id con el texto.
async function aplicarCatalogos(data) {
  if ("motivoInasistencia" in data) Object.assign(data, await motivoDelCatalogo(data.motivoInasistencia));
  if ("area" in data) Object.assign(data, await areaDelCatalogo(data.area));
  return data;
}

async function exigirNoRepetido(actividadId, documento, nombre, exceptoId = null) {
  const or = [{ nombre: { equals: nombre, mode: "insensitive" } }];
  if (documento) or.push({ documento });
  const otro = await prisma.participanteActividad.findFirst({ where: { actividadId, OR: or, id: exceptoId ? { not: exceptoId } : undefined }, select: { id: true } });
  if (otro) throw badRequest("Esa persona ya está en la actividad.", 409);
}

export async function crearParticipante(actividadId, body, actor) {
  const actividad = await actividadEditable(actividadId);
  const data = await aplicarCatalogos(leerParticipante(body || {}));
  await exigirNoRepetido(actividad.id, data.documento, data.nombre);
  const row = await prisma.participanteActividad.create({
    data: { ...data, actividadId: actividad.id, origen: "manual", creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
  });
  await sincronizarConteos(actividad.id);
  logParticipantes(actor, actividad, "crear", `Agregó a ${row.nombre}`).catch(() => {});
  if (row.observacion) clasificarEnSegundoPlano(actividad.id);
  return toClientParticipante(row, { verSensibles: true });
}

export async function actualizarParticipante(actividadId, id, body, actor) {
  const actividad = await actividadEditable(actividadId);
  const before = await prisma.participanteActividad.findFirst({ where: { id: Number(id), actividadId: actividad.id } });
  if (!before) throw badRequest("Participante no encontrado.", 404);
  const data = await aplicarCatalogos(leerParticipante(body || {}, { parcial: true }));
  if ("observacion" in data && data.observacion !== before.observacion) data.sentimiento = null;
  if ("nombre" in data || "documento" in data) await exigirNoRepetido(actividad.id, data.documento ?? before.documento, data.nombre ?? before.nombre, before.id);
  const row = await prisma.participanteActividad.update({ where: { id: before.id }, data });
  await sincronizarConteos(actividad.id);
  if (data.sentimiento === null && row.observacion) clasificarEnSegundoPlano(actividad.id);
  const cambios = [];
  if ("asistio" in data && data.asistio !== before.asistio) cambios.push(`asistencia: ${data.asistio === true ? "asistió" : data.asistio === false ? "no asistió" : "sin registrar"}`);
  if ("motivoInasistencia" in data && data.motivoInasistencia !== before.motivoInasistencia) cambios.push(`motivo: ${data.motivoInasistencia || "—"}`);
  if (cambios.length || Object.keys(data).some((k) => !["asistio", "motivoInasistencia"].includes(k))) {
    logParticipantes(actor, actividad, "editar", `${row.nombre}${cambios.length ? ` — ${cambios.join(", ")}` : ""}`).catch(() => {});
  }
  return toClientParticipante(row, { verSensibles: await isRoleAllowed(actor.role, actividad.linea === "Fundación" ? "editFundacion" : "editBienestar") });
}

// Asistencia en bloque: "asistió" o "no asistió" (con motivo) para varios a la vez.
export async function eliminarParticipante(actividadId, id, actor) {
  const actividad = await actividadEditable(actividadId);
  const row = await prisma.participanteActividad.findFirst({ where: { id: Number(id), actividadId: actividad.id } });
  if (!row) throw badRequest("Participante no encontrado.", 404);
  await prisma.participanteActividad.delete({ where: { id: row.id } });
  await sincronizarConteos(actividad.id);
  logParticipantes(actor, actividad, "eliminar", `Quitó a ${row.nombre}`).catch(() => {});
}

// Importa un Excel (Forms o lista de asistencia). modo "inscripcion": crea a los nuevos y completa a los existentes;
// modo "asistencia": solo actualiza la asistencia de los que ya están (por documento o nombre) y, con
// "noMarcadosNoAsistieron", marca como no asistieron a los inscritos que no aparecen en la lista.
export async function importarParticipantes(actividadId, buffer, { modo = "inscripcion", hoja, noMarcadosNoAsistieron = false } = {}, actor) {
  const actividad = await actividadEditable(actividadId);
  const leido = leerParticipantesExcel(buffer, { hoja });
  const r = await aplicarParticipantes(actividad, leido.participantes, { modo, noMarcadosNoAsistieron, actor, origen: "importacion" });
  logParticipantes(actor, actividad, "importar", `Importó Excel (${modo}): ${r.creados} nuevos, ${r.actualizados} actualizados${r.marcadosNo ? `, ${r.marcadosNo} sin marcar como no asistieron` : ""}`).catch(() => {});
  return { ...r, hoja: leido.hoja, columnas: leido.columnas };
}

// Núcleo de la importación (lo usa también scripts/bienestar/importarParticipantes.mjs vía la app).
// Modos: "inscripcion" (programados: crea a los nuevos como inscritos), "asistencia" (solo marca a los que ya están),
// "asistentes" (marca a los que están; quien asistió sin estar inscrito se agrega como asistente no inscrito) y
// "calificaciones" (pone la calificación y el comentario de cada persona; quien calificó sin estar se agrega como
// asistente). simular: no escribe nada, solo cuenta qué haría (la vista previa de la importación con Nova).
const MODOS_QUE_CREAN = ["inscripcion", "asistentes", "calificaciones"];
export async function aplicarParticipantes(actividad, lista, { modo = "inscripcion", noMarcadosNoAsistieron = false, actor = null, origen = "importacion", creadoPorNombre, simular = false } = {}) {
  const existentes = await prisma.participanteActividad.findMany({ where: { actividadId: actividad.id } });
  const cat = await resolvedoresImportacion({ crear: !simular, actor });
  const porDoc = new Map(existentes.filter((p) => p.documento).map((p) => [p.documento, p]));
  const porNombre = new Map(existentes.map((p) => [sinTildes(p.nombre), p]));
  const vistos = new Set();
  let creados = 0, actualizados = 0, sinCoincidencia = 0;
  const nuevos = [];
  const sinCoincidir = [];
  for (const p of lista) {
    const actual = (p.documento && porDoc.get(p.documento)) || porNombre.get(sinTildes(p.nombre)) || buscarPorNombre([...porNombre.values()].filter((x) => !vistos.has(x.id)), p.nombre);
    if (actual) {
      vistos.add(actual.id);
      const data = {};
      if (p.asistio !== null && p.asistio !== undefined) { data.asistio = p.asistio; data.motivoInasistencia = p.asistio ? null : p.motivoInasistencia || actual.motivoInasistencia; }
      if (!actual.documento && p.documento) data.documento = p.documento;
      if (!actual.area && p.area) data.area = p.area;
      if (p.calificacion && (modo === "calificaciones" ? p.calificacion !== actual.calificacion : !actual.calificacion)) data.calificacion = p.calificacion;
      if (p.observacion && (modo === "calificaciones" ? p.observacion !== actual.observacion : !actual.observacion)) { data.observacion = p.observacion; data.sentimiento = null; }
      if (modo === "calificaciones" && p.calificacion && actual.asistio !== true) data.asistio = true;
      if (p.datos && Object.keys(p.datos).length) data.datos = JSON.stringify({ ...parse(actual.datos, {}), ...p.datos });
      if ("motivoInasistencia" in data) Object.assign(data, cat.motivo(data.motivoInasistencia));
      if ("area" in data) Object.assign(data, await cat.area(data.area));
      if (Object.keys(data).length) {
        if (!simular) await prisma.participanteActividad.update({ where: { id: actual.id }, data });
        actualizados++;
      }
    } else if (MODOS_QUE_CREAN.includes(modo)) {
      const asistio = modo === "inscripcion" ? p.asistio ?? null : p.asistio ?? true;
      const datosNuevo = {
          actividadId: actividad.id, nombre: p.nombre.slice(0, 200), documento: p.documento, area: p.area, correo: p.correo || null,
          inscrito: modo === "inscripcion", asistio, motivoInasistencia: asistio === false ? p.motivoInasistencia : null,
          calificacion: p.calificacion, observacion: p.observacion,
          datos: p.datos && Object.keys(p.datos).length ? JSON.stringify(p.datos) : null,
          origen, creadoPorUserId: actor?.id || null, creadoPorNombre: creadoPorNombre || actor?.nombre || "Importación Excel",
      };
      Object.assign(datosNuevo, await cat.area(p.area), cat.motivo(datosNuevo.motivoInasistencia));
      const row = simular ? { ...datosNuevo, id: `sim-${creados}` } : await prisma.participanteActividad.create({ data: datosNuevo });
      if (nuevos.length < 50) nuevos.push(row.nombre);
      vistos.add(row.id);
      if (row.documento) porDoc.set(row.documento, row);
      porNombre.set(sinTildes(row.nombre), row);
      creados++;
    } else {
      sinCoincidencia++;
      if (sinCoincidir.length < 50) sinCoincidir.push(p.nombre);
    }
  }
  let marcadosNo = 0;
  if ((modo === "asistencia" || modo === "asistentes") && noMarcadosNoAsistieron) {
    const where = { actividadId: actividad.id, inscrito: true, asistio: null, id: { notIn: [...vistos].filter((id) => typeof id === "number") } };
    marcadosNo = simular ? await prisma.participanteActividad.count({ where }) : (await prisma.participanteActividad.updateMany({ where, data: { asistio: false } })).count;
  }
  if (!simular) {
    await sincronizarConteos(actividad.id);
    clasificarEnSegundoPlano(actividad.id);
  }
  return { leidos: lista.length, creados, actualizados, sinCoincidencia, marcadosNo, nuevos, sinCoincidir };
}

// ---------- Formulario público ----------

export async function configurarFormulario(actividadId, body, actor) {
  const actividad = await actividadEditable(actividadId);
  let campos = parse(actividad.formularioCampos, []);
  if (body?.plantilla) {
    const p = PLANTILLAS_FORMULARIO[body.plantilla];
    if (!p) throw badRequest("Plantilla inválida.");
    campos = p.campos;
  } else if (Array.isArray(body?.campos)) {
    campos = body.campos.slice(0, 30).map((c, i) => ({
      clave: String(c.clave || `campo${i + 1}`).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) || `campo${i + 1}`,
      etiqueta: String(c.etiqueta || "").trim().slice(0, 200),
      tipo: ["texto", "numero", "opcion", "si_no", "fecha", "parrafo"].includes(c.tipo) ? c.tipo : "texto",
      opciones: c.tipo === "opcion" ? (c.opciones || []).map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 20) : undefined,
      obligatorio: !!c.obligatorio,
      sensible: !!c.sensible,
    })).filter((c) => c.etiqueta);
  }
  const data = { formularioCampos: JSON.stringify(campos) };
  if (body?.abierto !== undefined) {
    data.formularioAbierto = !!body.abierto;
    if (data.formularioAbierto && actividad.estado === "cerrada") throw badRequest("La actividad está cerrada: no puede recibir inscripciones.");
  }
  if (!actividad.formularioToken || body?.nuevoEnlace) data.formularioToken = randomBytes(12).toString("base64url");
  const row = await prisma.actividadBienestar.update({ where: { id: actividad.id }, data });
  logFormularioActividad(actor, row, data.formularioAbierto !== undefined ? (data.formularioAbierto ? "abrió" : "cerró") : "configuró").catch(() => {});
  return { formularioToken: row.formularioToken, formularioAbierto: row.formularioAbierto, formularioCampos: parse(row.formularioCampos, []) };
}

async function actividadPorToken(token) {
  const a = await prisma.actividadBienestar.findUnique({ where: { formularioToken: String(token || "") } });
  if (!a || !a.formularioAbierto || a.estado === "cerrada" || !a.aplicaParticipantes) throw badRequest("Este formulario no existe o ya no recibe inscripciones.", 404);
  return a;
}

export async function formularioPublico(token) {
  const a = await actividadPorToken(token);
  return { nombre: a.nombre, fecha: a.fecha, linea: a.linea, descripcion: a.descripcion, campos: parse(a.formularioCampos, []), areas: await valoresActivos("areaParticipante") };
}

export async function inscribirPublico(token, body) {
  const a = await actividadPorToken(token);
  if (body?.autorizaDatos !== true) throw badRequest("Debes autorizar el tratamiento de tus datos personales para inscribirte.");
  const nombre = String(body?.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const documento = normalizarDocumento(body?.documento);
  const area = String(body?.area ?? "").trim().toUpperCase().slice(0, 120);
  if (!nombre || !documento || !area) throw badRequest("Completa tu nombre, tu número de documento (solo números) y tu área.");
  const delMaestro = await areaDelCatalogo(area);
  const campos = parse(a.formularioCampos, []);
  const datos = {};
  for (const c of campos) {
    const v = body?.datos?.[c.clave];
    const texto = v === undefined || v === null ? "" : String(v).trim().slice(0, c.tipo === "parrafo" ? 1000 : 200);
    if (c.obligatorio && !texto) throw badRequest(`Completa "${c.etiqueta}".`);
    if (c.tipo === "opcion" && texto && !(c.opciones || []).includes(texto)) throw badRequest(`Elige una opción válida en "${c.etiqueta}".`);
    if (c.tipo === "numero" && texto && !Number.isFinite(Number(texto))) throw badRequest(`"${c.etiqueta}" debe ser un número.`);
    if (texto) datos[c.etiqueta] = texto;
  }
  const ya = await prisma.participanteActividad.findFirst({ where: { actividadId: a.id, documento }, select: { id: true } });
  if (ya) throw badRequest("Ya estás inscrito en esta actividad. Si necesitas cambiar algo, escríbele al equipo de Bienestar.", 409);
  const row = await prisma.participanteActividad.create({
    data: {
      actividadId: a.id, nombre, documento, area: delMaestro.area, areaId: delMaestro.areaId, correo: String(body?.correo ?? "").trim().slice(0, 200) || null,
      inscrito: true, observacion: String(body?.observacion ?? "").trim().slice(0, 1000) || null,
      datos: Object.keys(datos).length ? JSON.stringify(datos) : null,
      origen: "formulario", autorizaDatos: true, autorizaDatosAt: new Date(), creadoPorNombre: "Formulario público",
    },
  });
  await sincronizarConteos(a.id);
  logParticipantes(null, a, "crear", `Inscripción por formulario: ${row.nombre}`).catch(() => {});
  if (row.observacion) clasificarEnSegundoPlano(a.id);
  return { ok: true, actividad: a.nombre };
}
