import { prisma } from "@/lib/prisma";
import { FIELD_LABELS } from "@/lib/auditLabels";

export { FIELD_LABELS, ACTION_LABELS } from "@/lib/auditLabels";

function recordSummary(r) {
  if (!r) return null;
  const numTag = r.localSeq ? `#${r.localSeq}` : null;
  const desc = [r.informe, r.descripcion].filter(Boolean).join(" — ");
  return [numTag, desc].filter(Boolean).join(" · ") || r.id;
}

function normalize(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function diffFields(before, after) {
  const changes = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if (normalize(b) !== normalize(a)) {
      changes.push({ field: key, label: FIELD_LABELS[key], before: b ?? null, after: a ?? null });
    }
  }
  return changes;
}

async function writeLog({ action, recordId, recordInfo, actor, changes }) {
  await prisma.auditLog.create({
    data: {
      action,
      recordId,
      recordInfo: recordInfo || null,
      userId: actor?.id || null,
      userNombre: actor?.nombre || null,
      userEmail: actor?.email || null,
      changes: changes && changes.length ? JSON.stringify(changes) : null,
    },
  });
}

// Para crear/eliminar se guarda el snapshot completo de los campos (no solo un
// diff), así queda registrado exactamente qué contenía el registro creado o eliminado.
export async function logCreate(actor, record) {
  const changes = diffFields(null, record);
  await writeLog({ action: "crear", recordId: record.id, recordInfo: recordSummary(record), actor, changes });
}

// action: "editar" (edición completa) o "radicar" (toggle del check de radicado).
export async function logUpdate(actor, before, after, action = "editar") {
  const changes = diffFields(before, after);
  if (!changes.length) return;
  await writeLog({ action, recordId: after.id, recordInfo: recordSummary(after), actor, changes });
}

export async function logDelete(actor, record) {
  const changes = diffFields(record, null);
  await writeLog({ action: "eliminar", recordId: record.id, recordInfo: recordSummary(record), actor, changes });
}

export async function listAuditLogs({ from, to, userId, recordId, page = 1, pageSize = 50 } = {}) {
  const where = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999`);
  }
  if (userId) where.userId = userId;
  if (recordId) where.recordId = recordId;

  const safePage = Math.max(1, page);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    page: safePage,
    pageSize,
    logs: rows.map((r) => ({
      id: r.id,
      action: r.action,
      recordId: r.recordId,
      recordInfo: r.recordInfo,
      userId: r.userId,
      userNombre: r.userNombre,
      userEmail: r.userEmail,
      changes: r.changes ? JSON.parse(r.changes) : null,
      createdAt: r.createdAt,
    })),
  };
}

// Autores distintos que aparecen en el log (incluye usuarios ya eliminados),
// para poblar el filtro por usuario sin depender de la tabla users.
export async function listAuditActors() {
  const rows = await prisma.auditLog.findMany({
    where: { userId: { not: null } },
    distinct: ["userId"],
    select: { userId: true, userNombre: true, userEmail: true },
    orderBy: { userNombre: "asc" },
  });
  return rows.map((r) => ({ id: r.userId, nombre: r.userNombre, email: r.userEmail }));
}
