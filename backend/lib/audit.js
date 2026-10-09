import { prisma } from "@/lib/prisma";
import { FIELD_LABELS, MAESTRO_FIELD_LABELS, PROVEEDOR_FIELD_LABELS, USER_FIELD_LABELS, REPORT_FIELD_LABELS } from "@/lib/auditLabels";

export { FIELD_LABELS, MAESTRO_FIELD_LABELS, PROVEEDOR_FIELD_LABELS, USER_FIELD_LABELS, REPORT_FIELD_LABELS, ACTION_LABELS } from "@/lib/auditLabels";

// Nombre corto del tipo de maestro para el resumen del log — copia local
// (sin importar lib/maestros.js) para no crear una dependencia circular
// entre lib/maestros.js y lib/audit.js.
const TIPO_LABELS_RESUMEN = {
  area: "Área",
  responsable: "Responsable",
  estado: "Estado de compra",
  medioPago: "Medio de pago",
  estadoLegalizacion: "Estado legalización",
};

function recordSummary(r) {
  if (!r) return null;
  const numTag = r.localSeq ? `#${r.localSeq}` : null;
  const desc = [r.informe, r.descripcion].filter(Boolean).join(" — ");
  return [numTag, desc].filter(Boolean).join(" · ") || r.id;
}

function maestroSummary(m) {
  if (!m) return null;
  return `${TIPO_LABELS_RESUMEN[m.tipo] || m.tipo}: ${m.valor}`;
}

function userSummary(u) {
  if (!u) return null;
  return u.email ? `${u.nombre} (${u.email})` : u.nombre;
}

function normalize(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function diffFields(before, after, fieldLabels) {
  const changes = [];
  for (const key of Object.keys(fieldLabels)) {
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if (normalize(b) !== normalize(a)) {
      changes.push({ field: key, label: fieldLabels[key], before: b ?? null, after: a ?? null });
    }
  }
  return changes;
}

async function writeLog({ action, entityType, recordId, recordInfo, actor, changes }) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
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
  const changes = diffFields(null, record, FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "record", recordId: record.id, recordInfo: recordSummary(record), actor, changes });
}

// action: "editar" (edición completa) o "radicar" (toggle del check de radicado).
export async function logUpdate(actor, before, after, action = "editar") {
  const changes = diffFields(before, after, FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action, entityType: "record", recordId: after.id, recordInfo: recordSummary(after), actor, changes });
}

export async function logDelete(actor, record) {
  const changes = diffFields(record, null, FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "record", recordId: record.id, recordInfo: recordSummary(record), actor, changes });
}

// ---------- Maestros ----------

export async function logMaestroCreate(actor, maestro) {
  const changes = diffFields(null, maestro, MAESTRO_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "maestro", recordId: maestro.id, recordInfo: maestroSummary(maestro), actor, changes });
}

export async function logMaestroUpdate(actor, before, after) {
  const changes = diffFields(before, after, MAESTRO_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "maestro", recordId: after.id, recordInfo: maestroSummary(after), actor, changes });
}

export async function logMaestroDelete(actor, maestro) {
  const changes = diffFields(maestro, null, MAESTRO_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "maestro", recordId: maestro.id, recordInfo: maestroSummary(maestro), actor, changes });
}

// ---------- Proveedores ----------

function proveedorSummary(p) {
  if (!p) return null;
  return `${p.nombre} (NIT ${p.nit})`;
}

export async function logProveedorCreate(actor, proveedor) {
  const changes = diffFields(null, proveedor, PROVEEDOR_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "proveedor", recordId: proveedor.id, recordInfo: proveedorSummary(proveedor), actor, changes });
}

export async function logProveedorUpdate(actor, before, after) {
  const changes = diffFields(before, after, PROVEEDOR_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "proveedor", recordId: after.id, recordInfo: proveedorSummary(after), actor, changes });
}

export async function logProveedorDelete(actor, proveedor) {
  const changes = diffFields(proveedor, null, PROVEEDOR_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "proveedor", recordId: proveedor.id, recordInfo: proveedorSummary(proveedor), actor, changes });
}

// ---------- Usuarios ----------
// Los objetos antes/después deben venir ya en forma "cliente" (toClientUser),
// es decir, sin el hash de la contraseña — nunca se audita la contraseña.

export async function logUserCreate(actor, user) {
  const changes = diffFields(null, user, USER_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "user", recordId: user.id, recordInfo: userSummary(user), actor, changes });
}

export async function logUserUpdate(actor, before, after) {
  const changes = diffFields(before, after, USER_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "user", recordId: after.id, recordInfo: userSummary(after), actor, changes });
}

export async function logUserDelete(actor, user) {
  const changes = diffFields(user, null, USER_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "user", recordId: user.id, recordInfo: userSummary(user), actor, changes });
}

// ---------- Presupuestos ----------
// El presupuesto no tiene campos escalares simples que diffear con
// diffFields (modo "categoria" es una lista) — se guarda como un solo campo
// "presupuesto" con el snapshot antes/después en JSON.

function presupuestoSummary(p) {
  if (!p) return null;
  return `Presupuesto ${p.area} · ${p.anio}`;
}

function presupuestoValueSnapshot(p) {
  if (!p) return null;
  return p.modo === "area"
    ? { modo: "area", valorArea: p.valorArea }
    : { modo: "categoria", categorias: p.categorias };
}

export async function logPresupuestoUpsert(actor, before, after) {
  const beforeVal = presupuestoValueSnapshot(before);
  const afterVal = presupuestoValueSnapshot(after);
  if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) return;
  const changes = [{
    field: "presupuesto",
    label: "Presupuesto",
    before: beforeVal ? JSON.stringify(beforeVal) : null,
    after: afterVal ? JSON.stringify(afterVal) : null,
  }];
  await writeLog({
    action: before ? "editar" : "crear",
    entityType: "presupuesto",
    recordId: after.id,
    recordInfo: presupuestoSummary(after),
    actor,
    changes,
  });
}

export async function logPresupuestoDelete(actor, p) {
  const changes = [{ field: "presupuesto", label: "Presupuesto", before: JSON.stringify(presupuestoValueSnapshot(p)), after: null }];
  await writeLog({ action: "eliminar", entityType: "presupuesto", recordId: p.id, recordInfo: presupuestoSummary(p), actor, changes });
}

// El modo (por área/por categoría) es general por año — este cambio puede
// implicar borrar todos los presupuestos de áreas configurados en el modo
// anterior (ver lib/presupuestos.js#setModoAnio), por eso queda auditado aparte.
export async function logPresupuestoModoChange(actor, anio, modoAnterior, modoNuevo, presupuestosBorrados) {
  const changes = [{
    field: "modo",
    label: "Modo de presupuesto del año",
    before: modoAnterior,
    after: modoNuevo,
  }];
  const info = presupuestosBorrados > 0
    ? `Presupuesto ${anio} — cambió de modo (se borraron ${presupuestosBorrados} área(s) configuradas por "${modoAnterior === "area" ? "área" : "categoría"}")`
    : `Presupuesto ${anio} — modo definido`;
  await writeLog({ action: "editar", entityType: "presupuesto", recordId: `anio-${anio}`, recordInfo: info, actor, changes });
}

// ---------- Matriz de permisos ----------
// role_feature (ver lib/permissions.js) como recordId, así cada celda de la
// matriz tiene su propio historial identificable.
export async function logPermissionChange(actor, role, roleLabel, featureLabel, before, after) {
  if (before === after) return;
  const changes = [{ field: "allowed", label: featureLabel, before: normalize(before), after: normalize(after) }];
  await writeLog({
    action: "editar",
    entityType: "permiso",
    recordId: `${role}-${featureLabel}`,
    recordInfo: `Permiso de "${roleLabel}" sobre "${featureLabel}"`,
    actor,
    changes,
  });
}

// ---------- Informes automáticos ----------

function reportSummary(r) {
  if (!r) return null;
  return `Informe "${r.nombre}"`;
}

export async function logReportCreate(actor, report) {
  const changes = diffFields(null, report, REPORT_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "informe", recordId: report.id, recordInfo: reportSummary(report), actor, changes });
}

export async function logReportUpdate(actor, before, after) {
  const changes = diffFields(before, after, REPORT_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "informe", recordId: after.id, recordInfo: reportSummary(after), actor, changes });
}

export async function logReportDelete(actor, report) {
  const changes = diffFields(report, null, REPORT_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "informe", recordId: report.id, recordInfo: reportSummary(report), actor, changes });
}

export async function logReportSent(actor, report, ok, detail) {
  await writeLog({
    action: "enviar",
    entityType: "informe",
    recordId: report.id,
    recordInfo: `Informe "${report.nombre}" ${ok ? "enviado" : "con error de envío"}${detail ? ` — ${detail}` : ""}`,
    actor,
    changes: null,
  });
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
      entityType: r.entityType,
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

// ---------- Agente IA (chat) ----------
// Segunda capa de validación del chat (ver lib/agentModeration.js): cuando el
// moderador detecta que una respuesta ya generada violó las reglas (habló
// fuera de tema, reveló infraestructura o dio información de credenciales),
// queda registrado acá para que un admin pueda auditarlo — independiente de
// que la respuesta mostrada al usuario ya se haya sustituido por el rechazo.
export async function logAgentViolation(actor, { conversationId, userMessage, categoria, razon }) {
  await writeLog({
    action: "bloqueoIa",
    entityType: "agente-ia",
    recordId: conversationId || null,
    recordInfo: `Respuesta bloqueada (${categoria || "sin categoría"})${razon ? ` — ${razon}` : ""} · Pregunta: "${(userMessage || "").slice(0, 200)}"`,
    actor,
    changes: null,
  });
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
