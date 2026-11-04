import { prisma } from "@/lib/prisma";
import { isRoleAllowed } from "@/lib/permissions";
import { hoyColombia } from "@/lib/hoyColombia";

// Avisos de Bienestar a la Bandeja (Alertas y notificaciones › Bandeja): una actividad cuya fecha ya pasó y sigue
// creada o programada no se sabe si se hizo. Cada persona que puede editar esa línea recibe UN SOLO aviso por actividad,
// el día en que se vence (nunca se repite, aunque le cambien la fecha), con el enlace al formulario para marcarla como ejecutada o
// moverle la fecha. Es un aviso directo del sistema (sin regla configurada), igual que los de solicitudes de compra.

const CADA_MS = 24 * 60 * 60 * 1000; // una revisión al día (al arrancar y luego cada 24 h): las fechas son por día
const FEATURE_EDITAR = { Bienestar: "editBienestar", "Fundación": "editFundacion" };

const claveDe = (a) => `vencida|${a.id}`;

export async function avisarActividadesVencidas() {
  const hoy = hoyColombia();
  const vencidas = (await prisma.actividadBienestar.findMany({
    where: { estado: { in: ["creada", "programada"] }, fecha: { not: null, lt: hoy } },
    select: { id: true, nombre: true, linea: true, fecha: true, fechaFin: true, estado: true },
  })).filter((a) => (a.fechaFin || a.fecha) < hoy);
  if (!vencidas.length) return 0;

  const usuarios = await prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true, role: true } });
  const destinatarios = {};
  for (const linea of Object.keys(FEATURE_EDITAR)) {
    destinatarios[linea] = [];
    for (const u of usuarios) if (await isRoleAllowed(u.role, FEATURE_EDITAR[linea])) destinatarios[linea].push(u);
  }

  // Avisos ya enviados, por persona y clave (la clave va dentro del contenido).
  const previos = await prisma.notificacionEntrega.findMany({
    where: { ejecucionId: null, contenido: { contains: "\"clave\":\"vencida|" } },
    select: { userId: true, contenido: true },
  });
  const enviados = new Set(previos.map((p) => { try { return `${p.userId}#${JSON.parse(p.contenido).clave.split("|").slice(0, 2).join("|")}`; } catch { return ""; } }));

  const nuevos = [];
  for (const a of vencidas) {
    const base = a.linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar";
    const contenido = JSON.stringify({
      sistema: true,
      fuente: "bienestar",
      clave: claveDe(a),
      titulo: `${a.nombre}: ya pasó y sigue ${a.estado}`,
      texto: `La fecha de la actividad (${a.fechaFin && a.fechaFin !== a.fecha ? `${a.fecha} a ${a.fechaFin}` : a.fecha}) ya pasó. Márcala como ejecutada y carga la asistencia, o cámbiale la fecha si se movió.`,
      notificacionNombre: `Actividades de ${a.linea}`,
      tituloItems: "Actividad por resolver",
      items: [{ ref: a.fecha, titulo: a.nombre, contexto: `${a.linea} · ${a.estado}`, href: `${base}/actividades/${a.id}/editar` }],
    });
    for (const u of destinatarios[a.linea] || []) {
      if (enviados.has(`${u.id}#${claveDe(a)}`)) continue;
      nuevos.push({ userId: u.id, userNombre: u.nombre || "", canal: "app", estado: "enviada", enviadaAt: new Date(), contenido, creadoPorNombre: "Sistema" });
    }
  }
  if (nuevos.length) await prisma.notificacionEntrega.createMany({ data: nuevos });
  return nuevos.length;
}

export function startAvisosBienestar() {
  if (globalThis.__avisosBienestar) return;
  globalThis.__avisosBienestar = true;
  const correr = () => avisarActividadesVencidas().catch((e) => console.error("[avisos bienestar]", e.message));
  setTimeout(correr, 30 * 1000);
  setInterval(correr, CADA_MS);
}
