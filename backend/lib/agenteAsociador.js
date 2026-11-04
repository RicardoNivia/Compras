import { prisma } from "@/lib/prisma";
import { generateStructuredJson } from "@/lib/aiStructured";
import { AREAS_BIENESTAR } from "@/lib/actividadesBienestar";
import { asignarActividadACompra } from "@/lib/records";
import { logPropuestaAsociacion } from "@/lib/audit";
import { isRoleAllowed } from "@/lib/permissions";
import { hoyColombia } from "@/lib/hoyColombia";
import { agenteActivo } from "@/lib/configAgentes";

// Agente asociador de Bienestar: para cada compra del área Bienestar que no tiene actividad, propone a cuál pertenece.
// El sistema escoge primero las actividades candidatas (fecha cercana, palabras en común, categoría y proveedor que ya
// usaron sus otras compras) y Nova solo elige entre esas y dice qué tan segura está y por qué. Nada se asocia solo:
// quien edita Bienestar confirma ("Sí, asociar", que pasa por records.js y queda en la auditoría de la compra) o descarta.
// Corre a pedido ("Buscar ahora", sin avisos: el resultado se ve en pantalla) y, solo si alguien encendió su revisión
// diaria (lib/configAgentes.js), una vez al día, avisando en la Bandeja. Una compra con propuesta no se vuelve a mirar en
// 30 días.

const DIAS_ANTES = 75; // la compra suele pedirse antes de la actividad
const DIAS_DESPUES = 20; // o pocos días después (legalizaciones, reembolsos)
const MAX_CANDIDATAS = 4;
const POR_LLAMADA = 25;
const MAX_POR_PASADA = 200;
const REVISAR_DE_NUEVO_DIAS = 30;
const CADA_MS = 24 * 60 * 60 * 1000;
const CONFIANZAS = ["alta", "media", "baja"];

const VACIAS = new Set("de la el los las del y a en para por con un una al se su sus o que es mes dia dias x".split(" "));
const palabras = (t) => new Set(String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !VACIAS.has(w)));
const dias = (a, b) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;

const estado = { corriendo: false, ultima: null };
export const estadoAsociador = () => ({ ...estado });

// Señales concretas entre una compra y una actividad (la fecha sola no es una señal).
function senales(compra, act) {
  const pc = palabras(compra.descripcion);
  const pn = palabras(act.nombre);
  const pd = palabras(act.descripcion);
  let enNombre = 0;
  let enDescripcion = 0;
  for (const w of pc) { if (pn.has(w)) enNombre++; else if (pd.has(w)) enDescripcion++; }
  return { enNombre, enDescripcion, categoria: !!(compra.categoria && act.categorias.has(compra.categoria)), proveedor: !!(compra.proveedor && act.proveedores.has(compra.proveedor)) };
}

function puntaje(compra, act) {
  const d = dias(act.fecha, compra.fechaSolicitud); // positivo: la actividad es después de la compra
  const s = senales(compra, act);
  // Si la compra nombra la actividad, se mira más lejos en el tiempo.
  const antes = s.enNombre ? 150 : DIAS_ANTES;
  const despues = s.enNombre ? 45 : DIAS_DESPUES;
  if (d < -despues || d > antes) return 0;
  let p = d >= 0 ? 30 - (d / antes) * 20 : 15 - (-d / despues) * 10;
  p += s.enNombre * 25 + s.enDescripcion * 8 + (s.categoria ? 15 : 0) + (s.proveedor ? 12 : 0);
  return p;
}

// La confianza no queda solo en manos de la IA: "alta" exige que la compra nombre la actividad, "media" al menos una
// señal concreta (palabras, o categoría o proveedor que ya usan sus otras compras), y sin ninguna señal no hay propuesta.
function confianzaFinal(dicha, s) {
  const conSenal = s.enNombre || s.enDescripcion || s.categoria || s.proveedor;
  if (!conSenal) return null;
  let c = CONFIANZAS.includes(dicha) ? dicha : "baja";
  if (c === "alta" && !s.enNombre) c = "media";
  if (c === "media" && !s.enNombre && !s.enDescripcion && !(s.categoria && s.proveedor)) c = "baja";
  return c;
}

async function comprasPorRevisar() {
  const desde = new Date(Date.now() - REVISAR_DE_NUEVO_DIAS * 864e5);
  const recientes = await prisma.propuestaAsociacion.findMany({
    where: { OR: [{ estado: { in: ["pendiente", "aceptada"] } }, { createdAt: { gte: desde } }] },
    select: { recordId: true },
  });
  const yaVistas = new Set(recientes.map((r) => r.recordId));
  const compras = await prisma.record.findMany({
    where: { actividadId: null, estado: { not: "Anulado" }, fechaSolicitud: { not: null }, OR: AREAS_BIENESTAR.map((a) => ({ area: { equals: a, mode: "insensitive" } })) },
    select: { id: true, localSeq: true, fechaSolicitud: true, descripcion: true, proveedor: true, categoria: true, valorConIva: true },
    orderBy: { fechaSolicitud: "desc" },
  });
  return compras.filter((c) => !yaVistas.has(c.id)).slice(0, MAX_POR_PASADA);
}

async function actividadesCandidatas() {
  const acts = await prisma.actividadBienestar.findMany({
    where: { fecha: { not: null }, estado: { not: "cerrada" } },
    select: { id: true, nombre: true, descripcion: true, fecha: true, linea: true, compras: { select: { categoria: true, proveedor: true } } },
  });
  return acts.map((a) => ({ ...a, categorias: new Set(a.compras.map((c) => c.categoria).filter(Boolean)), proveedores: new Set(a.compras.map((c) => c.proveedor).filter(Boolean)) }));
}

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    asignaciones: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { n: { type: "INTEGER" }, actividadId: { type: "INTEGER", nullable: true }, confianza: { type: "STRING" }, razon: { type: "STRING" } },
        required: ["n", "actividadId", "confianza", "razon"],
      },
    },
  },
  required: ["asignaciones"],
};

const SISTEMA = `Eres Nova y ayudas al equipo de Compras de Sinco a asociar compras del área de Bienestar con la actividad de Bienestar o Fundación a la que pertenecen.
Para cada compra recibes sus datos y unas pocas actividades candidatas (ya filtradas por fecha cercana). Elige la actividad a la que la compra pertenece SOLO si la descripción de la compra lo respalda (nombra la actividad o algo propio de ella) o si el proveedor y la categoría coinciden con los de sus otras compras. La cercanía de fechas por sí sola NO basta: compras genéricas del área (frutas, snacks, cafetería, premios de concursos, dotación) sin relación clara con una actividad van con actividadId = null. Si ninguna encaja, actividadId = null.
confianza: "alta" (la descripción nombra la actividad o es inequívoca), "media" (encaja por tipo de compra y fecha), "baja" (posible pero dudosa). Las compras marcadas como datos de prueba o ficticios van con actividadId null.
razon: una frase corta en español que explique por qué (o por qué ninguna). No inventes datos.`;

async function proponerLote(lote) {
  const r = await generateStructuredJson({
    systemInstruction: SISTEMA,
    prompt: JSON.stringify(lote.map(({ compra, candidatas }, n) => ({
      n,
      compra: { fecha: compra.fechaSolicitud, descripcion: compra.descripcion, proveedor: compra.proveedor, categoria: compra.categoria, valor: compra.valorConIva },
      candidatas: candidatas.map((a) => ({ id: a.id, nombre: a.nombre, fecha: a.fecha, linea: a.linea, descripcion: (a.descripcion || "").slice(0, 200), categoriasDeSusCompras: [...a.categorias].slice(0, 6), proveedoresDeSusCompras: [...a.proveedores].slice(0, 6) })),
    }))),
    schema: ESQUEMA,
    budgetMs: 60000,
    cache: false,
  });
  return r?.asignaciones || [];
}

// Busca propuestas nuevas. Devuelve cuántas compras revisó y cuántas propuestas dejó. avisar: solo la revisión diaria
// automática deja aviso en la Bandeja.
export async function buscarPropuestas({ actor = null, avisar = false } = {}) {
  if (estado.corriendo) return { yaCorriendo: true };
  estado.corriendo = true;
  const inicio = Date.now();
  try {
    const [compras, actividades] = await Promise.all([comprasPorRevisar(), actividadesCandidatas()]);
    const conCandidatas = [];
    let sinCandidatas = 0;
    for (const compra of compras) {
      const candidatas = actividades.map((a) => ({ a, p: puntaje(compra, a) })).filter((x) => x.p > 0).sort((x, y) => y.p - x.p).slice(0, MAX_CANDIDATAS).map((x) => x.a);
      if (candidatas.length) conCandidatas.push({ compra, candidatas });
      else sinCandidatas++;
    }
    const creador = { creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || "Nova (automático)" };
    let propuestas = 0;
    let sinCoincidencia = 0;
    for (let i = 0; i < conCandidatas.length; i += POR_LLAMADA) {
      const lote = conCandidatas.slice(i, i + POR_LLAMADA);
      const respuestas = await proponerLote(lote);
      const porN = new Map(respuestas.map((x) => [Number(x.n), x]));
      const filas = lote.map(({ compra, candidatas }, n) => {
        const x = porN.get(n);
        const elegida = x ? candidatas.find((a) => a.id === Number(x.actividadId)) : null;
        const confianza = elegida ? confianzaFinal(x.confianza, senales(compra, elegida)) : null;
        if (!confianza) {
          sinCoincidencia++;
          const razon = elegida ? "Solo coincide la fecha; no hay nada en la compra que la relacione con una actividad." : x?.razon?.slice(0, 400) || "Ninguna actividad cercana coincide.";
          return { recordId: compra.id, recordSeq: compra.localSeq, actividadId: null, estado: "sin_coincidencia", razon, ...creador };
        }
        propuestas++;
        return { recordId: compra.id, recordSeq: compra.localSeq, actividadId: elegida.id, confianza, razon: String(x.razon || "").slice(0, 400), estado: "pendiente", ...creador };
      });
      await prisma.propuestaAsociacion.createMany({ data: filas });
    }
    if (propuestas && avisar) avisarPropuestas(propuestas).catch(() => {});
    estado.ultima = { at: new Date().toISOString(), revisadas: compras.length, propuestas, sinCoincidencia, sinCandidatas, ms: Date.now() - inicio };
    return estado.ultima;
  } finally {
    estado.corriendo = false;
  }
}

// Un aviso en la Bandeja a quien puede asociar (editBienestar o editFundacion) cuando hay propuestas nuevas.
async function avisarPropuestas(n) {
  const usuarios = await prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true, role: true } });
  const destino = [];
  for (const u of usuarios) if ((await isRoleAllowed(u.role, "editBienestar")) || (await isRoleAllowed(u.role, "editFundacion"))) destino.push(u);
  const contenido = JSON.stringify({
    sistema: true,
    fuente: "bienestar",
    titulo: `Nova propone la actividad de ${n} compra(s) de Bienestar`,
    texto: "Revisa cada propuesta y confirma con «Sí, asociar» o descártala. Nada se asocia sin tu confirmación.",
    notificacionNombre: "Agentes",
    tituloItems: "Por revisar",
    items: [{ ref: hoyColombia(), titulo: `${n} propuesta(s) nuevas`, contexto: "Agente asociador", href: "/bienestar/agentes" }],
  });
  if (destino.length) await prisma.notificacionEntrega.createMany({ data: destino.map((u) => ({ userId: u.id, userNombre: u.nombre || "", canal: "app", estado: "enviada", enviadaAt: new Date(), contenido, creadoPorNombre: "Nova (automático)" })) });
}

// Lista para la pantalla. Las pendientes cuya compra ya tiene actividad (alguien la asoció por otro lado) se cierran.
export async function listPropuestas() {
  const filas = await prisma.propuestaAsociacion.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2000 });
  const records = await prisma.record.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.recordId))] } }, select: { id: true, localSeq: true, fechaSolicitud: true, descripcion: true, proveedor: true, categoria: true, valorConIva: true, actividadId: true } });
  const porRecord = new Map(records.map((r) => [r.id, r]));
  const acts = await prisma.actividadBienestar.findMany({ where: { id: { in: [...new Set(filas.map((f) => f.actividadId).filter(Boolean))] } }, select: { id: true, nombre: true, fecha: true, linea: true, estado: true } });
  const porAct = new Map(acts.map((a) => [a.id, a]));
  const cerrar = filas.filter((f) => f.estado === "pendiente" && (!porRecord.get(f.recordId) || porRecord.get(f.recordId).actividadId));
  if (cerrar.length) {
    await prisma.propuestaAsociacion.updateMany({ where: { id: { in: cerrar.map((f) => f.id) } }, data: { estado: "resuelta", resueltaAt: new Date(), resueltaPorNombre: "Asociada por otro lado" } });
    for (const f of cerrar) f.estado = "resuelta";
  }
  return filas
    .filter((f) => porRecord.has(f.recordId))
    .map((f) => {
      const r = porRecord.get(f.recordId);
      const a = f.actividadId ? porAct.get(f.actividadId) : null;
      return {
        id: f.id, estado: f.estado, confianza: f.confianza, razon: f.razon, createdAt: f.createdAt, creadoPorNombre: f.creadoPorNombre,
        resueltaAt: f.resueltaAt, resueltaPorNombre: f.resueltaPorNombre,
        compra: { id: r.id, numero: r.localSeq, fecha: r.fechaSolicitud, descripcion: r.descripcion, proveedor: r.proveedor, categoria: r.categoria, valor: r.valorConIva },
        actividad: a ? { id: a.id, nombre: a.nombre, fecha: a.fecha, linea: a.linea, estado: a.estado } : null,
      };
    });
}

function error(msg, status = 400) {
  return Object.assign(new Error(msg), { status });
}

// puedeLinea(linea): si quien acepta puede editar la línea de la actividad (Bienestar y Fundación van por separado).
export async function aceptarPropuesta(id, actor, puedeLinea = null) {
  const f = await prisma.propuestaAsociacion.findUnique({ where: { id: Number(id) } });
  if (!f) throw error("Propuesta no encontrada.", 404);
  if (f.estado !== "pendiente" || !f.actividadId) throw error("Esta propuesta ya se resolvió.");
  const act = await prisma.actividadBienestar.findUnique({ where: { id: f.actividadId }, select: { nombre: true, estado: true, linea: true } });
  if (!act) throw error("La actividad propuesta ya no existe.");
  if (puedeLinea && !(await puedeLinea(act.linea))) throw error(`No tienes permiso para editar actividades de ${act.linea}.`, 403);
  if (act.estado === "cerrada") throw error("La actividad está cerrada: ya no recibe compras.");
  const r = await prisma.record.findUnique({ where: { id: f.recordId }, select: { actividadId: true } });
  if (!r) throw error("La compra ya no existe.");
  if (r.actividadId) throw error("La compra ya tiene una actividad.");
  await asignarActividadACompra(f.recordId, f.actividadId, actor);
  await prisma.propuestaAsociacion.update({ where: { id: f.id }, data: { estado: "aceptada", resueltaAt: new Date(), resueltaPorUserId: actor?.id || null, resueltaPorNombre: actor?.nombre || null } });
  logPropuestaAsociacion(actor, { ...f, actividad: act.nombre }, "aceptar", `Asociada a «${act.nombre}» (confianza ${f.confianza}). ${f.razon || ""}`.trim()).catch(() => {});
}

export async function descartarPropuesta(id, actor) {
  const f = await prisma.propuestaAsociacion.findUnique({ where: { id: Number(id) } });
  if (!f) throw error("Propuesta no encontrada.", 404);
  if (f.estado !== "pendiente") throw error("Esta propuesta ya se resolvió.");
  const act = f.actividadId ? await prisma.actividadBienestar.findUnique({ where: { id: f.actividadId }, select: { nombre: true } }) : null;
  await prisma.propuestaAsociacion.update({ where: { id: f.id }, data: { estado: "descartada", resueltaAt: new Date(), resueltaPorUserId: actor?.id || null, resueltaPorNombre: actor?.nombre || null } });
  logPropuestaAsociacion(actor, { ...f, actividad: act?.nombre }, "descartar", `Descartó la propuesta «${act?.nombre || "sin actividad"}» (confianza ${f.confianza}).`).catch(() => {});
}

// Varias a la vez (p. ej. "Asociar todas las de confianza alta"): cada una por separado; una que falle no frena las demás.
export async function resolverVarias(ids, accion, actor, puedeLinea = null) {
  const hechas = [];
  const errores = [];
  for (const id of ids.slice(0, 300)) {
    try {
      if (accion === "aceptar") await aceptarPropuesta(id, actor, puedeLinea);
      else await descartarPropuesta(id, actor);
      hechas.push(id);
    } catch (e) {
      errores.push({ id, error: e.message });
    }
  }
  return { hechas: hechas.length, errores };
}

export function startAgenteAsociador() {
  if (process.env.AGENTES_COMPRAS_AUTO === "0" || globalThis.__agenteAsociador) return;
  globalThis.__agenteAsociador = true;
  // Se mira cada hora si está encendido y si ya pasó un día desde la última revisión automática.
  let ultima = 0;
  const revisar = async () => {
    if (Date.now() - ultima < CADA_MS || !(await agenteActivo("asociador"))) return;
    ultima = Date.now();
    await buscarPropuestas({ avisar: true });
  };
  const correr = () => revisar().catch((e) => console.error("[agente asociador]", e.message));
  setTimeout(correr, 5 * 60 * 1000);
  setInterval(correr, 60 * 60 * 1000);
}
