import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { createSessionToken, verifySessionToken } from "@/lib/session";
import { cifrar, descifrar } from "@/lib/cifradoTokens";
import { modoCorreo, urlAutorizacion, canjearCodigo, refrescarToken, miBuzon } from "@/lib/correoGraph";
import { logCuentaCorreo } from "@/lib/audit";

// Correo de Microsoft 365 vinculado por cada persona (una cuenta por persona). Solo se acepta el buzón con el MISMO
// correo del usuario del panel: así nadie conecta el buzón de otro. Desvincular borra los tokens.

const badRequest = (m) => Object.assign(new Error(m), { status: 400 });
export const COOKIE_ESTADO = "correo_oauth";
const VIGENCIA_ESTADO_MS = 10 * 60 * 1000;

const paraAuditoria = (c) => ({ email: c.email, estado: c.estado, agenteActivo: c.agenteActivo });

export function toClientCuenta(c) {
  if (!c) return null;
  return {
    id: c.id,
    email: c.email,
    proveedor: c.proveedor,
    agenteActivo: c.agenteActivo,
    estado: c.estado,
    ultimoError: c.ultimoError,
    ultimaRevision: c.ultimaRevision,
    revisadoHasta: c.revisadoHasta,
    createdAt: c.createdAt,
    creadoPorNombre: c.creadoPorNombre,
  };
}

export async function estadoCorreo(user) {
  const cuenta = await prisma.cuentaCorreo.findUnique({ where: { userId: user.id } });
  const pendientes = await prisma.solicitudProveedorCorreo.count({ where: { userId: user.id, estado: "pendiente" } });
  return { modo: modoCorreo(), cuenta: toClientCuenta(cuenta), pendientes, emailUsuario: user.email };
}

// Paso 1: arma la URL de Microsoft. state = token firmado (persona + nonce, 10 min) y el nonce va también en una cookie.
export async function iniciarVinculacion(user) {
  const modo = modoCorreo();
  if (modo === "desactivado") throw badRequest("La conexión con el correo de Microsoft aún no está habilitada en el servidor.");
  const nonce = randomBytes(16).toString("base64url");
  if (modo === "simulado") return { simulado: true, nonce };
  const state = await createSessionToken({ p: "correo", uid: user.id, n: nonce, exp: Date.now() + VIGENCIA_ESTADO_MS });
  return { url: urlAutorizacion({ state, loginHint: user.email }), nonce };
}

// Modo simulado: vincula sin Microsoft (para probar el agente pegando correos).
export async function vincularSimulado(user) {
  if (modoCorreo() !== "simulado") throw badRequest("El modo simulado no está activo en el servidor.");
  return guardarCuenta(user, { email: String(user.email).toLowerCase(), proveedor: "simulado", tokens: null });
}

// Paso 2: Microsoft vuelve con ?code&state. Se valida el state contra la sesión y la cookie, se canjea el código
// y se comprueba que el buzón sea el de la persona.
export async function completarVinculacion(user, { code, state, nonceCookie }) {
  if (modoCorreo() !== "real") throw badRequest("La conexión con el correo de Microsoft no está habilitada en el servidor.");
  const s = await verifySessionToken(state);
  if (!s || s.p !== "correo" || s.uid !== user.id || !nonceCookie || s.n !== nonceCookie) {
    throw badRequest("La autorización venció o no corresponde a tu sesión. Vuelve a intentarlo desde Mi correo.");
  }
  if (!code) throw badRequest("Microsoft no devolvió la autorización.");
  const tokens = await canjearCodigo(code);
  const buzon = await miBuzon(tokens.accessToken);
  if (!buzon.email || buzon.email !== String(user.email).toLowerCase()) {
    throw badRequest(`Iniciaste sesión en Microsoft como ${buzon.email || "otra cuenta"}, pero tu usuario del panel es ${user.email}. Vincula el correo de tu propia cuenta.`);
  }
  return guardarCuenta(user, { email: buzon.email, proveedor: "microsoft", tokens });
}

async function guardarCuenta(user, { email, proveedor, tokens }) {
  const antes = await prisma.cuentaCorreo.findUnique({ where: { userId: user.id } });
  const data = {
    email, proveedor, userNombre: user.nombre || "",
    accessToken: tokens ? cifrar(tokens.accessToken) : null,
    refreshToken: tokens?.refreshToken ? cifrar(tokens.refreshToken) : null,
    expiraAt: tokens?.expiraAt || null,
    estado: "activa", ultimoError: null,
  };
  const cuenta = antes
    ? await prisma.cuentaCorreo.update({ where: { userId: user.id }, data })
    // Al vincular por primera vez se leen los correos de los últimos 7 días.
    : await prisma.cuentaCorreo.create({ data: { ...data, userId: user.id, agenteActivo: true, revisadoHasta: new Date(Date.now() - 7 * 86400000), creadoPorUserId: user.id, creadoPorNombre: user.nombre || null } });
  logCuentaCorreo(user, "vincular", cuenta, antes ? paraAuditoria(antes) : null, paraAuditoria(cuenta)).catch(() => {});
  return toClientCuenta(cuenta);
}

export async function desvincular(user) {
  const cuenta = await prisma.cuentaCorreo.findUnique({ where: { userId: user.id } });
  if (!cuenta) throw badRequest("No tienes un correo vinculado.");
  await prisma.cuentaCorreo.delete({ where: { id: cuenta.id } });
  await prisma.correoRevisado.deleteMany({ where: { cuentaId: cuenta.id } });
  logCuentaCorreo(user, "desvincular", cuenta, paraAuditoria(cuenta), null).catch(() => {});
  return { ok: true };
}

export async function cambiarAgente(user, activo) {
  const cuenta = await prisma.cuentaCorreo.findUnique({ where: { userId: user.id } });
  if (!cuenta) throw badRequest("Primero vincula tu correo.");
  const nueva = await prisma.cuentaCorreo.update({ where: { id: cuenta.id }, data: { agenteActivo: !!activo } });
  logCuentaCorreo(user, "editar", nueva, paraAuditoria(cuenta), paraAuditoria(nueva)).catch(() => {});
  return toClientCuenta(nueva);
}

// Token de acceso vigente (lo renueva si venció). Si Microsoft lo rechaza, la cuenta queda en "error" para volver a vincular.
export async function tokenVigente(cuenta) {
  const actual = descifrar(cuenta.accessToken);
  if (actual && cuenta.expiraAt && cuenta.expiraAt > new Date()) return actual;
  const refresh = descifrar(cuenta.refreshToken);
  if (!refresh) {
    await marcarError(cuenta, "La autorización ya no es válida. Vuelve a vincular tu correo.");
    return null;
  }
  try {
    const t = await refrescarToken(refresh);
    await prisma.cuentaCorreo.update({
      where: { id: cuenta.id },
      data: { accessToken: cifrar(t.accessToken), refreshToken: t.refreshToken ? cifrar(t.refreshToken) : cuenta.refreshToken, expiraAt: t.expiraAt },
    });
    return t.accessToken;
  } catch (e) {
    if (e.graphStatus === 400 || e.graphStatus === 401) await marcarError(cuenta, e.message);
    throw e;
  }
}

export async function marcarError(cuenta, mensaje) {
  await prisma.cuentaCorreo.update({ where: { id: cuenta.id }, data: { estado: "error", ultimoError: String(mensaje).slice(0, 500) } });
}
