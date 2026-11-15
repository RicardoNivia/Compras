import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { cifrar, descifrar } from "@/lib/cifradoTokens";
import { USUARIO_COMPARTIDO } from "@/lib/correoCuentas";
import { probarGmail, mensajesNuevosGmail, enlaceGmail } from "@/lib/correoGmail";
import { leerComprobante, analizarLeido } from "@/lib/tesoreria/soportes";
import { logCuentaCorreo, logTesoreria } from "@/lib/audit";

// Correo de soportes: UN buzón de Gmail compartido, sin dueño (CuentaCorreo tipo "compartido", userId "compartido").
// Lo configura un administrador con el correo y una contraseña de aplicación de Google. Los demás buzones reenvían ahí
// (reglas de reenvío) los soportes de pago. SOLO soportes de pago: las solicitudes de proveedor por correo se quitaron
// (noviembre 2026).
//
// Cada 10 minutos (con el agente encendido) se leen los correos nuevos de la Bandeja de entrada, menos Promociones y
// anuncios masivos. Un filtro en código decide qué va a Nova (nada más se paga): un adjunto PDF/foto, o un texto de
// banco (transferencia, PSE, comprobante…). Nova lee cada comprobante y queda pendiente (SoporteCorreoTesoreria) en
// Mi correo › Pagos y Tesorería › Movimientos › «Llegó al correo», para que una persona lo registre como movimiento,
// lo adjunte al que ya existía y lo asocie a su pago. El agente NUNCA crea movimientos ni asocia.
// Cada correo se analiza una vez (CorreoRevisado). Si Nova falla, el correo queda para la próxima revisión.

const CLAVE = { userId_tipo: { userId: USUARIO_COMPARTIDO, tipo: "compartido" } };
const NOMBRE = "Correo de soportes";
const ACTOR_AGENTE = { id: null, nombre: "Agente de correo", email: null };
const MAX_NOVA_POR_REVISION = 20;
const MAX_ADJUNTOS_POR_CORREO = 3;
const MAX_ARCHIVO = 10 * 1024 * 1024;

const err = (m, status = 400) => Object.assign(new Error(m), { status });
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const limpiar = (s, max = 300) => (s == null ? null : String(s).replace(/�/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) || null);
const paraAuditoria = (c) => (c ? { email: c.email, estado: c.estado, agenteActivo: c.agenteActivo } : null);

// ---------- Configuración (solo administradores) ----------

function toClient(c) {
  if (!c) return null;
  return {
    id: c.id, email: c.email, agenteActivo: c.agenteActivo, estado: c.estado, ultimoError: c.ultimoError,
    ultimaRevision: c.ultimaRevision, revisadoHasta: c.revisadoHasta, createdAt: c.createdAt, creadoPorNombre: c.creadoPorNombre,
  };
}

export async function estadoBuzon() {
  const c = await prisma.cuentaCorreo.findUnique({ where: CLAVE });
  const soportes = await prisma.soporteCorreoTesoreria.count({ where: { estado: "pendiente" } });
  return { cuenta: toClient(c), pendientes: { soportes } };
}

// Prueba la conexión y guarda (o reemplaza) el buzón. La primera vez se leen los correos de los últimos 7 días.
export async function guardarBuzon(actor, { email, clave }) {
  const correo = String(email || "").trim().toLowerCase();
  const pass = String(clave || "").replace(/\s+/g, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw err("Escribe el correo de Gmail completo (por ejemplo soportes.empresa@gmail.com).");
  // El código de Google son 16 letras (se muestra en 4 grupos). Otra cosa casi siempre es la contraseña normal.
  if (!/^[a-z]{16}$/i.test(pass)) throw err("Eso no parece el código de 16 letras de Google: no sirve la contraseña normal del Gmail. Créalo en Cuenta de Google › Contraseñas de aplicación (necesita la verificación en dos pasos activa) y pégalo aquí.");
  const prueba = await probarGmail(correo, pass); // lanza un error claro si Gmail no la acepta
  const antes = await prisma.cuentaCorreo.findUnique({ where: CLAVE });
  const mismoBuzon = antes && antes.email === correo;
  const data = {
    email: correo, proveedor: "gmail", userNombre: NOMBRE, claveCifrada: cifrar(pass),
    accessToken: null, refreshToken: null, expiraAt: null, estado: "activa", ultimoError: null,
    // Otro buzón: se empieza de nuevo (últimos 7 días). El mismo con otra contraseña: sigue donde iba.
    ...(mismoBuzon ? {} : { imapUidValidity: prueba.uidValidity, imapUltimoUid: null, revisadoHasta: new Date(Date.now() - 7 * 86400000) }),
  };
  const c = antes
    ? await prisma.cuentaCorreo.update({ where: { id: antes.id }, data })
    : await prisma.cuentaCorreo.create({ data: { ...data, ...CLAVE.userId_tipo, agenteActivo: true, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  if (antes && !mismoBuzon) await prisma.correoRevisado.deleteMany({ where: { cuentaId: c.id } });
  logCuentaCorreo(actor, "vincular", c, paraAuditoria(antes), paraAuditoria(c)).catch(() => {});
  return { cuenta: toClient(c), mensajes: prueba.mensajes };
}

export async function cambiarAgenteBuzon(actor, activo) {
  const c = await prisma.cuentaCorreo.findUnique({ where: CLAVE });
  if (!c) throw err("Primero configura el correo de soportes.");
  const nueva = await prisma.cuentaCorreo.update({ where: { id: c.id }, data: { agenteActivo: !!activo } });
  logCuentaCorreo(actor, "editar", nueva, paraAuditoria(c), paraAuditoria(nueva)).catch(() => {});
  return toClient(nueva);
}

// Quita el buzón y su contraseña. Los soportes que ya llegaron se conservan.
export async function quitarBuzon(actor) {
  const c = await prisma.cuentaCorreo.findUnique({ where: CLAVE });
  if (!c) throw err("No hay un correo de soportes configurado.");
  await prisma.cuentaCorreo.delete({ where: { id: c.id } });
  await prisma.correoRevisado.deleteMany({ where: { cuentaId: c.id } });
  logCuentaCorreo(actor, "desvincular", c, paraAuditoria(c), null).catch(() => {});
  return { ok: true };
}

// ---------- Filtros en código (sin IA) ----------

const esLeible = (a) => !a.inline && (a.tamano || 0) > 0 && (a.tamano || 0) <= MAX_ARCHIVO
  && (/^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(a.tipoMime || "") || /\.(pdf|png|jpe?g|webp)$/i.test(a.nombre || ""));

const PALABRAS_PAGO = /(comprobante|transferencia|transaccion|pago (exitoso|realizado|aprobado|recibido|efectuado)|\bpse\b|consignaci|abono|soporte (de|del) pago|recibo de pago|\bcus\b|pagaste|recibiste|enviaste|desembolso|nota (debito|credito)|debito automatico)/;

export function pareceSoporte(asunto, texto, adjuntos = []) {
  if (adjuntos.some(esLeible)) return true;
  return PALABRAS_PAGO.test(sinTildes(`${asunto || ""}\n${texto || ""}`));
}

// Anuncio masivo (boletín, publicidad) que no cayó en Promociones: correo de lista y sin un adjunto que leer.
export function esAnuncio(m) {
  const masivo = m.encabezados?.listUnsubscribe || /^(bulk|list|junk)$/.test(m.encabezados?.precedence || "");
  return !!masivo && !m.adjuntos.some(esLeible);
}

// ---------- Revisión ----------

async function reclamar(cuentaId, mensajeId) {
  try {
    await prisma.correoRevisado.create({ data: { cuentaId, mensajeId, resultado: "procesando", creadoPorNombre: "Agente de correo" } });
    return true;
  } catch (e) {
    if (e.code === "P2002") return false;
    throw e;
  }
}
const marcar = (cuentaId, mensajeId, resultado) =>
  prisma.correoRevisado.update({ where: { cuentaId_mensajeId: { cuentaId, mensajeId } }, data: { resultado } }).catch(() => {});
const liberar = (cuentaId, mensajeId) =>
  prisma.correoRevisado.delete({ where: { cuentaId_mensajeId: { cuentaId, mensajeId } } }).catch(() => {});

async function yaEsta(sha1) {
  const [a, b] = await Promise.all([
    prisma.soporteMovimiento.findFirst({ where: { sha1 }, select: { id: true } }),
    prisma.soporteCorreoTesoreria.findFirst({ where: { sha1 }, select: { id: true } }),
  ]);
  return !!(a || b);
}

async function guardarSoporte(cuenta, m, indice, leido, archivo) {
  // Nova sugiere de una vez si el movimiento ya existe y a qué pago o gasto corresponde (entre candidatos del código).
  const { sugerencia } = await analizarLeido(leido, { conNova: true }).catch(() => ({ sugerencia: null }));
  const s = await prisma.soporteCorreoTesoreria.create({
    data: {
      cuentaId: cuenta.id, mensajeId: m.mensajeId, indice,
      remitente: limpiar(m.remitente, 200), asunto: limpiar(m.asunto, 300), recibidoAt: new Date(m.recibidoAt), webLink: enlaceGmail(m.messageId),
      archivoNombre: archivo ? limpiar(archivo.nombre, 200) || "soporte" : null, tipoMime: archivo?.tipoMime || null,
      tamano: archivo?.contenido?.length || null, sha1: archivo?.sha1 || null, contenido: archivo?.contenido || null,
      leido: JSON.stringify(leido), sugerencia: sugerencia ? JSON.stringify(sugerencia) : null, creadoPorNombre: "Agente de correo",
    },
  });
  logTesoreria(ACTOR_AGENTE, {
    action: "detectar", entityType: "soporteCorreoTesoreria", recordId: s.id, recordInfo: `Soporte del correo «${s.asunto || "sin asunto"}»`,
    after: {
      estado: "pendiente", remitente: s.remitente, asunto: s.asunto, archivo: s.archivoNombre || "Texto del correo", valor: leido.valor, fecha: leido.fecha, tercero: leido.tercero,
      sugerenciaMovimiento: sugerencia?.movimiento?.texto || "Ninguno", sugerenciaPago: sugerencia?.pago?.texto || "Ninguno",
    },
  }).catch(() => {});
  return s;
}

// Lee los comprobantes de un correo. Devuelve { soportes, llamadas } (llamadas = lecturas de Nova hechas).
async function procesarSoportes(cuenta, m, cupo) {
  let soportes = 0;
  let llamadas = 0;
  let indice = 0;
  const contexto = `De: ${m.remitente || "?"}\nAsunto: ${m.asunto || "(sin asunto)"}\n${String(m.texto || "").slice(0, 1500)}`;
  for (const a of m.adjuntos.filter(esLeible).slice(0, MAX_ADJUNTOS_POR_CORREO)) {
    if (llamadas >= cupo) break;
    const sha1 = createHash("sha1").update(a.contenido).digest("hex");
    if (await yaEsta(sha1)) continue; // el mismo archivo ya llegó o ya es soporte de un movimiento
    let leido = null;
    try {
      llamadas += 1;
      leido = await leerComprobante({ buffer: a.contenido, nombre: a.nombre, contexto });
    } catch (e) {
      if (e.motivo || e.status === 400) continue; // archivo rechazado por seguridad o que no se puede leer
      throw e;
    }
    if (!leido) continue;
    await guardarSoporte(cuenta, m, indice++, leido, { nombre: a.nombre, tipoMime: a.tipoMime, contenido: a.contenido, sha1 });
    llamadas += 1; // la sugerencia
    soportes += 1;
  }
  // Sin comprobante adjunto: el correo mismo puede ser la notificación del banco («Transferencia exitosa…»).
  if (!soportes && llamadas < cupo && PALABRAS_PAGO.test(sinTildes(`${m.asunto}\n${m.texto}`)) && String(m.texto || "").trim()) {
    llamadas += 1;
    const leido = await leerComprobante({ texto: `De: ${m.remitente || "?"}\nAsunto: ${m.asunto || "(sin asunto)"}\nFecha: ${m.recibidoAt}\n\n${m.texto}` });
    if (leido?.valor) {
      await guardarSoporte(cuenta, m, indice++, leido, null);
      llamadas += 1; // la sugerencia
      soportes += 1;
    }
  }
  return { soportes, llamadas };
}

const enCurso = globalThis.__buzonCompartidoEnCurso || (globalThis.__buzonCompartidoEnCurso = { activo: false });

export async function revisarBuzonCompartido({ manual = false } = {}) {
  const vacio = { revisados: 0, omitidos: 0, analizados: 0, soportes: 0 };
  if (enCurso.activo) return { ...vacio, enCurso: true };
  enCurso.activo = true;
  let cuenta = null;
  try {
    cuenta = await prisma.cuentaCorreo.findUnique({ where: CLAVE });
    if (!cuenta) {
      if (manual) throw err("Primero configura el correo de soportes.");
      return vacio;
    }
    if (!manual && (!cuenta.agenteActivo || cuenta.estado !== "activa")) return vacio;
    const clave = descifrar(cuenta.claveCifrada);
    if (!clave) {
      await prisma.cuentaCorreo.update({ where: { id: cuenta.id }, data: { estado: "error", ultimoError: "No se pudo leer la contraseña guardada. Vuelve a configurar el correo de soportes." } });
      return { ...vacio, error: "Vuelve a configurar el correo de soportes." };
    }

    const { uidValidity, mensajes } = await mensajesNuevosGmail(cuenta.email, clave, {
      uidValidity: cuenta.imapUidValidity, ultimoUid: cuenta.imapUltimoUid, desde: cuenta.revisadoHasta, max: 50,
    });
    // UIDVALIDITY nuevo: los UID anteriores ya no valen (se leyó por fecha).
    let ultimoUid = uidValidity === cuenta.imapUidValidity ? cuenta.imapUltimoUid : null;
    let hasta = cuenta.revisadoHasta;
    const r = { ...vacio };
    for (const m of mensajes) {
      const soporte = pareceSoporte(m.asunto, m.texto, m.adjuntos);
      if (!m.demasiadoGrande && !esAnuncio(m) && soporte) {
        const cupo = MAX_NOVA_POR_REVISION - r.analizados;
        if (cupo <= 0) break; // el resto queda para la próxima revisión (no se avanza)
        if (await reclamar(cuenta.id, m.mensajeId)) {
          try {
            const x = await procesarSoportes(cuenta, m, cupo);
            r.analizados += x.llamadas;
            r.soportes += x.soportes;
            await marcar(cuenta.id, m.mensajeId, x.soportes ? "soporte" : "no_es");
          } catch (e) {
            // Falla de la IA o de la BD: se libera el correo y se detiene aquí para reintentarlo en la próxima revisión.
            await liberar(cuenta.id, m.mensajeId);
            await guardarAvance(cuenta.id, { uidValidity, ultimoUid, hasta, error: `Se detuvo en el correo «${limpiar(m.asunto, 80) || "sin asunto"}»: ${e.message}` });
            r.error = e.message;
            return r;
          }
        }
      } else {
        r.omitidos += 1;
      }
      r.revisados += 1;
      ultimoUid = m.uid;
      if (!hasta || new Date(m.recibidoAt) > hasta) hasta = new Date(m.recibidoAt);
    }
    await guardarAvance(cuenta.id, { uidValidity, ultimoUid, hasta, error: null });
    return r;
  } catch (e) {
    if (cuenta) {
      await prisma.cuentaCorreo.update({
        where: { id: cuenta.id },
        data: { ultimaRevision: new Date(), ultimoError: limpiar(e.message, 500), ...(e.credenciales ? { estado: "error" } : {}) },
      }).catch(() => {});
    }
    throw e;
  } finally {
    enCurso.activo = false;
  }
}

function guardarAvance(cuentaId, { uidValidity, ultimoUid, hasta, error }) {
  return prisma.cuentaCorreo.update({
    where: { id: cuentaId },
    data: { imapUidValidity: uidValidity, imapUltimoUid: ultimoUid ?? null, revisadoHasta: hasta, ultimaRevision: new Date(), ultimoError: error, estado: "activa" },
  });
}
