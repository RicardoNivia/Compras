import { prisma } from "@/lib/prisma";
import { ymd } from "@/lib/reportSchedule";
import { FUENTES } from "@/lib/notificacionesCatalogo";
import { puedeVerFuente, puedeUsarNotificaciones, puedeGestionar } from "@/lib/notificacionesPermisos";
import { crearContexto, ejecutarConsulta } from "@/lib/notificacionesConsultas";
import { resultadoDeEventos, cumpleFiltros } from "@/lib/notificacionesEventos";
import { construirContenido, tarjetaTeams } from "@/lib/notificacionesMensaje";
import { enviarTarjeta, esReintentable, modoTeams } from "@/lib/teams";
import { getNotificacion, pausarPorPermisos } from "@/lib/notificaciones";
import { logNotificacionEnvio } from "@/lib/audit";

// Ejecuta UNA notificación: revalida permisos, consulta los datos, evalúa la condición, crea la ejecución y una
// entrega por persona y canal, y envía a Teams. Sin IA. Lo usan el programador (origen "programado"/"recuperado"),
// el botón "Enviar ahora" (origen "manual") y "Probar" (origen "prueba": a todos los destinatarios y a quien prueba, marcada como PRUEBA, sin contar como envío del día).
//
// Idempotencia: cada ejecución tiene una `clave` única. La programada es "n{id}|{día}", así nunca sale dos veces el
// mismo día aunque el servidor se reinicie; las manuales y las pruebas llevan la hora y no bloquean la programada.

const PROGRAMADOR = "Programador de notificaciones";
const PAUSA_ENTRE_ENVIOS_MS = 300;
const REINTENTOS_MIN = [1, 5, 15]; // minutos de espera antes del intento 2, 3 y 4
const err = (status, message) => Object.assign(new Error(message), { status });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };

function cumpleCondicion(n, total) {
  if (n.condicion === "siempre") return true;
  if (n.condicion === "umbral") return total >= (n.umbral || 1);
  return total > 0;
}

function proximoIntento(intentos) {
  const min = REINTENTOS_MIN[intentos - 1];
  return min ? new Date(Date.now() + min * 60000) : null;
}

async function enviarTeams(entrega, contenido, email) {
  const card = tarjetaTeams(contenido, { redirigidaDesde: process.env.TEAMS_DESTINO_PRUEBA ? `${entrega.userNombre} <${email || "sin correo"}>` : null });
  const r = await enviarTarjeta(email, card);
  const intentos = entrega.intentos + 1;
  const data = r.ok
    ? { estado: "enviada", enviadaAt: new Date(), intentos, motivo: r.simulado ? "Simulado (TEAMS_MODO=simulado): no se envió." : r.redirigidoA ? `Redirigido en local a ${r.redirigidoA}` : null, proximoIntento: null }
    : { estado: "error", intentos, motivo: r.motivo, proximoIntento: r.status != null && esReintentable(r.status) ? proximoIntento(intentos) : null };
  await prisma.notificacionEntrega.update({ where: { id: entrega.id }, data });
  return r.ok;
}

// Notificación por evento sin eventos dados (Probar / Enviar ahora): se usan los de las últimas 24 h como muestra.
async function eventosRecientes(n, ahora) {
  const desde = new Date(ahora.getTime() - 24 * 3600000);
  const rows = await prisma.eventoNotificacion.findMany({ where: { tipo: n.evento, createdAt: { gte: desde } }, orderBy: { id: "desc" }, take: 200 });
  return rows.filter((e) => cumpleFiltros(n, e)).reverse();
}

// opciones: { origen: "programado"|"recuperado"|"evento"|"manual"|"prueba", actor (manual/prueba), retrasoMin, ahora,
//             eventos (notificaciones por evento), clave (idempotencia del lote o del evento) }
export async function ejecutarNotificacion(id, { origen = "programado", actor = null, retrasoMin = null, ahora = new Date(), eventos = null, clave: claveDada = null } = {}) {
  const n = await getNotificacion(id);
  const manual = origen === "manual" || origen === "prueba";
  if (manual && !puedeGestionar(actor, n)) throw err(403, "Solo quien creó la notificación o un administrador puede enviarla.");
  if (origen === "manual" && n.estado === "borrador") throw err(400, "Es un borrador: actívala o pruébala primero.");
  // Por evento sale cuando ocurre el hecho: no se envía ni se prueba a mano.
  if (manual && n.disparador === "evento") throw err(400, "Esta notificación está asociada a un evento: se envía sola cuando ocurre el hecho, no se puede enviar ni probar a mano.");

  // 1. El propietario debe seguir teniendo acceso a los datos; si no, se pausa sola (o se rechaza el envío manual).
  const propietario = await prisma.user.findUnique({ where: { id: n.propietarioUserId }, select: { id: true, nombre: true, email: true, role: true, activo: true } });
  const propietarioOk = propietario && (await puedeUsarNotificaciones(propietario)) && (await puedeVerFuente(propietario, n.fuente));
  if (!propietarioOk) {
    const motivo = !propietario || !propietario.activo
      ? `${n.propietarioNombre} ya no está activo en el panel.`
      : `${n.propietarioNombre} ya no tiene acceso a ${FUENTES[n.fuente]?.label || n.fuente}.`;
    if (manual) throw err(403, `No se puede enviar: ${motivo}`);
    await pausarPorPermisos(n, motivo);
    return { estado: "pausada_por_permisos", mensaje: motivo };
  }

  // 2. La ejecución se crea primero: la clave única es el candado contra envíos duplicados.
  const clave = claveDada || (origen === "programado" || origen === "recuperado" ? `n${n.id}|${ymd(ahora)}` : `n${n.id}|${origen}|${ahora.getTime()}`);
  let ejecucion;
  try {
    ejecucion = await prisma.notificacionEjecucion.create({
      data: {
        notificacionId: n.id, clave, origen, estado: "procesando", retrasoMin,
        creadoPorUserId: manual ? actor.id : null,
        creadoPorNombre: manual ? actor.nombre : PROGRAMADOR,
      },
    });
  } catch (e) {
    if (e?.code === "P2002") return { estado: "duplicada", mensaje: "Ya se ejecutó hoy." };
    throw e;
  }

  try {
    const canales = parse(n.canales, ["app"]);
    const teamsActivo = canales.includes("teams") && modoTeams() !== "desactivado";
    const ctx = crearContexto({ propietario, ahora });
    const personal = n.alcance === "personal";
    // Por evento: el resultado sale de los eventos (dados o, en pruebas y envíos manuales, los de las últimas 24 h).
    const porEvento = n.disparador === "evento";
    const listaEventos = porEvento ? eventos || (await eventosRecientes(n, ahora)) : null;
    const consultar = async (dest) => {
      if (!porEvento) return ejecutarConsulta(n, ctx, dest);
      const r = resultadoDeEventos(n, listaEventos, dest);
      r.valores = { ...r.valores, fecha: ahora.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), nombre: (dest || propietario)?.nombre || "" };
      return r;
    };

    // 3. Destinatarios: los que no se dieron de baja. En una prueba, además quien prueba (aunque no esté en la lista),
    //    para que vea lo mismo que les llega a los demás.
    const ids = n.destinatarios.filter((d) => !d.deBaja).map((d) => d.userId);
    if (origen === "prueba" && !ids.includes(actor.id)) ids.push(actor.id);
    const personas = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, email: true, role: true, activo: true } });
    const encontrados = new Set(personas.map((p) => p.id));
    for (const d of n.destinatarios) if (!d.deBaja && !encontrados.has(d.userId)) personas.push({ id: d.userId, nombre: d.userNombre, activo: false, _eliminado: true });

    // 4. Consulta general (una sola vez) y condición.
    let general = null;
    if (!personal) {
      general = await consultar(null);
      if (!cumpleCondicion(n, general.total) && origen !== "prueba") {
        await prisma.notificacionEjecucion.update({ where: { id: ejecucion.id }, data: { estado: "omitida_sin_resultados", resultados: general.total, contenido: JSON.stringify(construirContenido(n, general, { origen, actorNombre: actor?.nombre })) } });
        if (origen !== "prueba") await prisma.notificacion.update({ where: { id: n.id }, data: { ultimaEjecucionAt: new Date(), ultimoResultado: "omitida_sin_resultados" } });
        const mensaje = `No se envió: no hay resultados${n.condicion === "umbral" ? ` suficientes (mínimo ${n.umbral})` : ""}.`;
        if (origen === "manual") logNotificacionEnvio(actor, n, "enviar", `envío manual sin resultados, no se envió`).catch(() => {});
        return { estado: "omitida_sin_resultados", resultados: general.total, mensaje, ejecucionId: ejecucion.id };
      }
    }

    // 5. Entregas por persona.
    const porEnviarTeams = [];
    let resultados = general?.total ?? 0;
    let enviadasApp = 0;
    let omitidas = 0;
    for (const p of personas) {
      const base = { ejecucionId: ejecucion.id, userId: p.id, userNombre: p.nombre, creadoPorUserId: manual ? actor.id : null, creadoPorNombre: manual ? actor.nombre : PROGRAMADOR };
      const sinAcceso = p._eliminado ? "El usuario ya no existe." : !p.activo ? "Usuario inactivo." : !(await puedeVerFuente(p, n.fuente)) || !(await puedeUsarNotificaciones(p)) ? `Ya no tiene acceso a ${FUENTES[n.fuente]?.label || n.fuente}.` : null;
      if (sinAcceso) {
        await prisma.notificacionEntrega.create({ data: { ...base, canal: "app", estado: "omitida", motivo: sinAcceso } });
        omitidas++;
        continue;
      }
      let resultado = general;
      if (personal) {
        resultado = await consultar(p);
        resultados += resultado.total;
        if (!cumpleCondicion(n, resultado.total) && origen !== "prueba") {
          await prisma.notificacionEntrega.create({ data: { ...base, canal: "app", estado: "omitida", motivo: "Sin resultados para esta persona." } });
          omitidas++;
          continue;
        }
      }
      const contenido = construirContenido(n, resultado, { origen, actorNombre: actor?.nombre });
      if (origen === "prueba" && !cumpleCondicion(n, resultado.total)) contenido.texto += "\n\n(Sin resultados: con la condición actual, este envío se omitiría.)";
      const json = JSON.stringify(contenido);
      await prisma.notificacionEntrega.create({ data: { ...base, canal: "app", estado: "enviada", enviadaAt: new Date(), contenido: json } });
      enviadasApp++;
      if (teamsActivo) {
        const e = await prisma.notificacionEntrega.create({ data: { ...base, canal: "teams", estado: "pendiente", contenido: json } });
        porEnviarTeams.push({ entrega: e, contenido, email: p.email });
      }
    }

    // 6. Teams, en secuencia y con una pausa corta entre envíos.
    let teamsOk = 0;
    let teamsError = 0;
    for (const [i, t] of porEnviarTeams.entries()) {
      if (i) await dormir(PAUSA_ENTRE_ENVIOS_MS);
      if (await enviarTeams(t.entrega, t.contenido, t.email)) teamsOk++; else teamsError++;
    }

    const estado = enviadasApp === 0 ? (omitidas ? "omitida_sin_resultados" : "error") : teamsError ? "parcial" : "enviada";
    await prisma.notificacionEjecucion.update({
      where: { id: ejecucion.id },
      data: { estado, resultados, contenido: general ? JSON.stringify(construirContenido(n, general, { origen, actorNombre: actor?.nombre })) : null },
    });
    if (origen !== "prueba") {
      const data = { ultimaEjecucionAt: new Date(), ultimoResultado: estado };
      // El envío único, una vez hecho por el programador, deja la notificación en pausa.
      if (n.frecuencia === "unica" && (origen === "programado" || origen === "recuperado")) Object.assign(data, { estado: "pausada", motivoPausa: "Envío único realizado.", pausadaAt: new Date(), pausadaPorNombre: "Sistema" });
      await prisma.notificacion.update({ where: { id: n.id }, data });
    }

    const partes = [`${enviadasApp} en la app`];
    if (porEnviarTeams.length) partes.push(`${teamsOk} por Teams${teamsError ? ` (${teamsError} con error)` : ""}`);
    if (canales.includes("teams") && !teamsActivo) partes.push("Teams no está configurado en el servidor");
    if (omitidas) partes.push(`${omitidas} omitida(s)`);
    const mensaje = `${origen === "prueba" ? "Prueba enviada" : "Enviada"}: ${partes.join(" · ")}.`;
    if (manual) logNotificacionEnvio(actor, n, origen === "prueba" ? "probar" : "enviar", `${origen === "prueba" ? "prueba" : "envío manual"} — ${partes.join(", ")}`).catch(() => {});
    return { estado, resultados, mensaje, ejecucionId: ejecucion.id };
  } catch (e) {
    await prisma.notificacionEjecucion.update({ where: { id: ejecucion.id }, data: { estado: "error", error: String(e?.message || e).slice(0, 500) } }).catch(() => {});
    if (origen !== "prueba") await prisma.notificacion.update({ where: { id: n.id }, data: { ultimaEjecucionAt: new Date(), ultimoResultado: "error" } }).catch(() => {});
    throw e;
  }
}

// Reintenta las entregas de Teams que fallaron por un error temporal (429, 5xx, red). Máximo 4 intentos.
export async function reintentarTeams() {
  if (modoTeams() === "desactivado") return;
  const pendientes = await prisma.notificacionEntrega.findMany({
    where: { canal: "teams", estado: "error", proximoIntento: { lte: new Date() }, intentos: { lt: REINTENTOS_MIN.length + 1 } },
    take: 20,
    orderBy: { proximoIntento: "asc" },
  });
  for (const [i, e] of pendientes.entries()) {
    if (i) await dormir(PAUSA_ENTRE_ENVIOS_MS);
    const u = await prisma.user.findUnique({ where: { id: e.userId }, select: { email: true, activo: true } });
    if (!u?.activo) {
      await prisma.notificacionEntrega.update({ where: { id: e.id }, data: { estado: "omitida", motivo: "Usuario inactivo.", proximoIntento: null } });
      continue;
    }
    const contenido = parse(e.contenido, null);
    if (!contenido) continue;
    await enviarTeams(e, contenido, u.email);
  }
}
