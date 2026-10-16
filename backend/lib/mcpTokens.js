import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/roles";
import { logTokenCreate, logTokenRevoke } from "@/lib/audit";
import { mcpPermitidoA } from "@/lib/mcpGate";

// Tokens personales para conectar un cliente MCP a /api/mcp. Solo se guarda el hash SHA-256 (el token tiene
// 256 bits aleatorios, no hace falta bcrypt); el valor en claro se devuelve una única vez al crearlo.

const PREFIJO_TOKEN = "cmp_";
const MAX_ACTIVOS_POR_USUARIO = 5;
const VIGENCIAS_DIAS = [30, 90, 180, 365];

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Defensa en profundidad: aunque una ruta olvide validar, solo un admin puede listar, crear o revocar tokens.
function soloAdmin(actor) {
  if (!mcpPermitidoA(actor?.role)) throw badRequest("Solo un administrador puede gestionar tokens de acceso.", 403);
}

const hashToken = (raw) => createHash("sha256").update(raw).digest("hex");

export function toClientToken(t, dueno = null) {
  const ahora = Date.now();
  const estado = t.revocadoAt ? "revocado" : t.expiraAt && t.expiraAt.getTime() <= ahora ? "expirado" : "activo";
  return {
    id: t.id,
    userId: t.userId,
    dueno: dueno ? { nombre: dueno.nombre, email: dueno.email } : null,
    nombre: t.nombre,
    prefijo: t.prefijo,
    estado,
    expiraAt: t.expiraAt,
    ultimoUsoAt: t.ultimoUsoAt,
    usos: t.usos,
    createdAt: t.createdAt,
    creadoPorNombre: t.creadoPorNombre,
    revocadoAt: t.revocadoAt,
    revocadoPorNombre: t.revocadoPorNombre,
  };
}

// Cada persona ve sus tokens; un admin con `todos` ve los de todos (para poder revocar el de alguien que se fue).
export async function listTokens(actor, { todos = false } = {}) {
  soloAdmin(actor);
  const verTodos = todos && actor.role === ROLES.ADMIN;
  const rows = await prisma.tokenAcceso.findMany({
    where: verTodos ? {} : { userId: actor.id },
    orderBy: { createdAt: "desc" },
  });
  const ids = [...new Set(rows.map((r) => r.userId))];
  const usuarios = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true, email: true } }) : [];
  const porId = new Map(usuarios.map((u) => [u.id, u]));
  return rows.map((r) => toClientToken(r, porId.get(r.userId) || null));
}

export async function createToken(actor, body) {
  soloAdmin(actor);
  const nombre = String(body?.nombre || "").trim().slice(0, 80);
  if (!nombre) throw badRequest("Ponle un nombre al token (por ejemplo, \"Mi Claude Desktop\").");
  const dias = Number(body?.diasVigencia);
  if (!VIGENCIAS_DIAS.includes(dias)) throw badRequest(`La vigencia debe ser de ${VIGENCIAS_DIAS.join(", ")} días.`);

  const ahora = new Date();
  const activos = await prisma.tokenAcceso.count({
    where: { userId: actor.id, revocadoAt: null, OR: [{ expiraAt: null }, { expiraAt: { gt: ahora } }] },
  });
  if (activos >= MAX_ACTIVOS_POR_USUARIO) {
    throw badRequest(`Ya tienes ${MAX_ACTIVOS_POR_USUARIO} tokens activos. Revoca alguno antes de crear otro.`);
  }

  const raw = PREFIJO_TOKEN + randomBytes(32).toString("base64url");
  const row = await prisma.tokenAcceso.create({
    data: {
      userId: actor.id,
      nombre,
      prefijo: raw.slice(0, 8),
      tokenHash: hashToken(raw),
      expiraAt: new Date(ahora.getTime() + dias * 86400000),
      creadoPorUserId: actor.id,
      creadoPorNombre: actor.nombre,
    },
  });
  const cliente = toClientToken(row, actor);
  logTokenCreate(actor, cliente).catch((e) => console.error("[audit] token", e.message));
  return { token: raw, ...cliente };
}

// Revoca un token propio; un admin puede revocar el de cualquiera. Revocar uno ya revocado es idempotente.
export async function revokeToken(actor, id) {
  soloAdmin(actor);
  const row = await prisma.tokenAcceso.findUnique({ where: { id: Number(id) } });
  if (!row || (row.userId !== actor.id && actor.role !== ROLES.ADMIN)) throw badRequest("Token no encontrado.", 404);
  if (row.revocadoAt) return toClientToken(row);
  const updated = await prisma.tokenAcceso.update({
    where: { id: row.id },
    data: { revocadoAt: new Date(), revocadoPorNombre: actor.nombre },
  });
  const dueno = await prisma.user.findUnique({ where: { id: row.userId }, select: { nombre: true, email: true } });
  const cliente = toClientToken(updated, dueno);
  logTokenRevoke(actor, toClientToken(row, dueno), cliente).catch(() => {});
  return cliente;
}

// Valida el Bearer de una llamada MCP y devuelve el usuario dueño (mismo shape que getSessionUser) o null.
// Se vuelve a leer el usuario en cada llamada: si lo desactivan, el token deja de servir al instante.
export async function authenticateBearer(raw) {
  if (!raw || !raw.startsWith(PREFIJO_TOKEN) || raw.length > 200) return null;
  const t = await prisma.tokenAcceso.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!t || t.revocadoAt || (t.expiraAt && t.expiraAt.getTime() <= Date.now())) return null;
  const u = await prisma.user.findUnique({ where: { id: t.userId } });
  if (!u || !u.activo || !mcpPermitidoA(u.role)) return null; // si el dueño deja de ser admin, su token deja de servir
  prisma.tokenAcceso.update({ where: { id: t.id }, data: { ultimoUsoAt: new Date(), usos: { increment: 1 } } }).catch(() => {});
  return { id: u.id, nombre: u.nombre, email: u.email, role: u.role, tokenId: t.id };
}
