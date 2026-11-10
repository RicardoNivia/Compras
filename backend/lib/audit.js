import { prisma } from "@/lib/prisma";
import { FIELD_LABELS, TOKEN_FIELD_LABELS, MAESTRO_FIELD_LABELS, PROVEEDOR_FIELD_LABELS, PROVEEDOR_PROCESO_FIELD_LABELS, PROVEEDOR_CHECKLIST_FIELD_LABELS, CICLO_PROVEEDOR_FIELD_LABELS, CONFIG_PROVEEDORES_FIELD_LABELS, USER_FIELD_LABELS, REPORT_FIELD_LABELS, CALIFICACION_FIELD_LABELS, VALORACION_FIELD_LABELS, NOTIFICACION_FIELD_LABELS, ACTIVIDAD_FIELD_LABELS, SOLICITUD_COMPRA_FIELD_LABELS, ROL_FIELD_LABELS, DETALLE_FIELD_LABELS, CUENTA_CORREO_FIELD_LABELS, SOLICITUD_PROVEEDOR_CORREO_FIELD_LABELS, MOVIMIENTO_TESORERIA_FIELD_LABELS, MAESTRO_TESORERIA_FIELD_LABELS, ACCESO_TESORERIA_FIELD_LABELS, CONCILIACION_TESORERIA_FIELD_LABELS, CIERRE_TESORERIA_FIELD_LABELS, EXTRACTO_TESORERIA_FIELD_LABELS, SOPORTE_TESORERIA_FIELD_LABELS } from "@/lib/auditLabels";

export { FIELD_LABELS, MAESTRO_FIELD_LABELS, PROVEEDOR_FIELD_LABELS, USER_FIELD_LABELS, REPORT_FIELD_LABELS, CALIFICACION_FIELD_LABELS, TOKEN_FIELD_LABELS, ACTION_LABELS, ENTITY_LABELS } from "@/lib/auditLabels";

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
  cambioQueCalifica({ action, entityType, recordId, changes }).catch(() => {});
}

// Lo que cuenta para el puntaje de Nova de una actividad (los mismos campos que mira el agente de evaluación): si cambia,
// se pide recalificar la actividad (analisisActividad.js#reanalizarEnSegundoPlano, con espera de 3 minutos). Cerrar
// la actividad no cuenta aquí porque el cierre ya la analiza.
const CAMPOS_ACTIVIDAD_PUNTAJE = new Set(["nombre", "fecha", "fechaFin", "descripcion", "presupuesto", "aplicaParticipantes", "inscritos", "asistentes", "observaciones", "estado"]);
const CAMPOS_COMPRA_PUNTAJE = new Set(["actividad", "actividadId", "descripcion", "proveedor", "valorConIva", "estadoLegalizacion"]);
async function cambioQueCalifica({ action, entityType, recordId, changes }) {
  const campos = Array.isArray(changes) ? changes : [];
  const destinos = new Set();
  if (["participante", "inventario", "observacionActividad"].includes(entityType)) destinos.add(Number(recordId));
  else if (entityType === "actividad") {
    if (action === "cerrar" || campos.some((c) => c.field === "estado" && String(c.after).toLowerCase() === "cerrada")) return;
    if (campos.some((c) => CAMPOS_ACTIVIDAD_PUNTAJE.has(c.field))) destinos.add(Number(recordId));
  } else if (entityType === "record") {
    if (!campos.some((c) => CAMPOS_COMPRA_PUNTAJE.has(c.field))) return;
    for (const c of campos) if (c.field === "actividadId") { if (Number(c.before)) destinos.add(Number(c.before)); if (Number(c.after)) destinos.add(Number(c.after)); }
    if (action !== "eliminar") {
      const r = await prisma.record.findUnique({ where: { id: String(recordId) }, select: { actividadId: true } }).catch(() => null);
      if (r?.actividadId) destinos.add(r.actividadId);
    }
  }
  destinos.delete(0);
  if (!destinos.size) return;
  const { reanalizarEnSegundoPlano } = await import("@/lib/analisisActividad");
  for (const id of destinos) if (Number.isInteger(id)) reanalizarEnSegundoPlano(id);
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

// ---------- Actividades de Bienestar (ver lib/actividadesBienestar.js) ----------

const actividadSummary = (a) => [a.fecha, a.nombre].filter(Boolean).join(" · ") || `Actividad ${a.id}`;

export async function logActividadCreate(actor, a) {
  const changes = diffFields(null, a, ACTIVIDAD_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "actividad", recordId: String(a.id), recordInfo: actividadSummary(a), actor, changes });
}

export async function logActividadUpdate(actor, before, after) {
  const changes = diffFields(before, after, ACTIVIDAD_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "actividad", recordId: String(after.id), recordInfo: actividadSummary(after), actor, changes });
}

export async function logActividadDelete(actor, a) {
  const changes = diffFields(a, null, ACTIVIDAD_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "actividad", recordId: String(a.id), recordInfo: actividadSummary(a), actor, changes });
}

// Participantes, inventario y formulario de una actividad: una entrada legible por acción, con la actividad como
// recordId (así el historial de la actividad las reúne). Sin actor = el formulario público.
const actorPublico = (actor) => actor || { nombre: "Formulario público" };

export async function logParticipantes(actor, actividad, action, detalle) {
  await writeLog({ action, entityType: "participante", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor: actorPublico(actor), changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

export async function logInventario(actor, actividad, action, detalle) {
  await writeLog({ action, entityType: "inventario", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

export async function logAgenteImportacion(actor, actividad, action, detalle) {
  await writeLog({ action, entityType: "agenteImportacion", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor, changes: [{ field: "detalle", label: "Detalle", before: null, after: detalle }] });
}

// Agente asociador de Bienestar: aceptar o descartar la actividad que Nova propuso para una compra (recordId = la compra).
export async function logPropuestaAsociacion(actor, propuesta, action, detalle) {
  await writeLog({ action, entityType: "propuestaAsociacion", recordId: String(propuesta.recordId), recordInfo: `Compra #${propuesta.recordSeq ?? "?"} → ${propuesta.actividad || "sin actividad"}`, actor, changes: [{ field: "detalle", label: "Detalle", before: null, after: detalle }] });
}

// Salario mínimo (SMMLV) de un año en Maestros de Compras. antes: { valor, norma } al editar o eliminar.
export async function logSalarioMinimo(actor, row, action, antes) {
  const changes = [
    { field: "valor", label: "Valor", before: antes?.valor ?? null, after: action === "eliminar" ? null : row.valor },
    { field: "norma", label: "Norma", before: antes?.norma ?? null, after: action === "eliminar" ? null : row.norma },
  ].filter((c) => c.before !== c.after);
  await writeLog({ action, entityType: "salarioMinimo", recordId: String(row.anio), recordInfo: `Salario mínimo ${row.anio}`, actor, changes });
}

// Encender o apagar un agente automático (lib/configAgentes.js).
export async function logConfigAgente(actor, clave, nombre, activo) {
  await writeLog({ action: activo ? "activar" : "desactivar", entityType: "configAgente", recordId: clave, recordInfo: nombre, actor, changes: [{ field: "activo", label: "Revisión diaria", before: !activo, after: !!activo }] });
}

// Agente cotizador: crear o eliminar un cuadro comparativo.
// Agente verificador de factura (Compras): queda en la historia de la compra que se verificó.
export async function logVerificacionFactura(actor, compra, detalle) {
  await writeLog({ action: "verificar", entityType: "verificacionFactura", recordId: String(compra.id), recordInfo: `Compra #${compra.localSeq ?? "—"}${compra.descripcion ? ` · ${String(compra.descripcion).slice(0, 60)}` : ""}`, actor, changes: [{ field: "detalle", label: "Detalle", before: null, after: detalle }] });
}

export async function logCuadroComparativo(actor, cuadro, action, detalle) {
  await writeLog({ action, entityType: "cuadroComparativo", recordId: String(cuadro.id), recordInfo: cuadro.titulo, actor, changes: [{ field: "detalle", label: "Detalle", before: null, after: detalle }] });
}

export async function logSentimientoComentarios(actividad, detalle) {
  await writeLog({ action: "clasificar", entityType: "sentimientoComentario", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor: { nombre: "Nova (automático)" }, changes: [{ field: "detalle", label: "Detalle", before: null, after: detalle }] });
}

export async function logObservacionActividad(actor, actividad, action, detalle) {
  await writeLog({ action, entityType: "observacionActividad", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor, changes: [{ field: "detalle", label: "Detalle", before: null, after: detalle }] });
}

export async function logFotos(actor, actividad, action, detalle) {
  await writeLog({ action, entityType: "fotoActividad", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

// Análisis de Nova del Resumen de Bienestar (lib/analisisBienestar.js): quién lo generó o lo regeneró y de qué período.
export async function logAnalisisBienestar(actor, analisis, action, detalle) {
  await writeLog({ action, entityType: "analisisBienestar", recordId: String(analisis.id), recordInfo: `${analisis.linea} · ${analisis.mes ? `${analisis.anio}-${String(analisis.mes).padStart(2, "0")}` : `${analisis.anio} (general)`}`, actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

export async function logAnalisisActividad(actor, actividad, action, detalle) {
  await writeLog({ action, entityType: "analisisActividad", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

const solicitudSummary = (s) => `${s.actividad || `Actividad ${s.actividadId}`} · ${String(s.descripcion).slice(0, 80)}`;

export async function logSolicitudCompraCreada(actor, s) {
  await writeLog({ action: "crear", entityType: "solicitudCompra", recordId: String(s.id), recordInfo: solicitudSummary(s), actor, changes: diffFields(null, s, SOLICITUD_COMPRA_FIELD_LABELS) });
}

export async function logSolicitudCompra(actor, s, action, detalle) {
  await writeLog({ action, entityType: "solicitudCompra", recordId: String(s.id), recordInfo: solicitudSummary(s), actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

export async function logAgenteEvaluacion(actor, trabajoId, detalle) {
  await writeLog({ action: "editar", entityType: "agenteEvaluacion", recordId: String(trabajoId), recordInfo: "Agente de evaluación de actividades", actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

// Asociar o quitar una compra desde la actividad: además de la entrada de la compra, queda en el historial de la actividad.
export async function logCompraDeActividad(actor, actividad, detalle) {
  await writeLog({ action: "editar", entityType: "actividad", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: detalle }] });
}

export async function logFormularioActividad(actor, actividad, verbo) {
  await writeLog({ action: "editar", entityType: "formularioActividad", recordId: String(actividad.id), recordInfo: actividadSummary(actividad), actor, changes: [{ field: "detalle", label: DETALLE_FIELD_LABELS.detalle, before: null, after: `${verbo[0].toUpperCase()}${verbo.slice(1)} el formulario público de inscripción` }] });
}

// ---------- Proveedores ----------

function proveedorSummary(p) {
  if (!p) return null;
  return `${p.nombre} (NIT ${p.nit})`;
}

export async function logProveedorCreate(actor, proveedor) {
  const changes = diffFields(null, proveedor, PROVEEDOR_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "proveedor", recordId: proveedor.nit, recordInfo: proveedorSummary(proveedor), actor, changes });
}

export async function logProveedorUpdate(actor, before, after) {
  const changes = diffFields(before, after, PROVEEDOR_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "proveedor", recordId: after.nit, recordInfo: proveedorSummary(after), actor, changes });
}

export async function logProveedorDelete(actor, proveedor) {
  const changes = diffFields(proveedor, null, PROVEEDOR_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "proveedor", recordId: proveedor.nit, recordInfo: proveedorSummary(proveedor), actor, changes });
}

// ---------- Procesos y checklist de proveedores ----------
// Mismo entityType "proveedor" que arriba — son cambios sobre el mismo
// proveedor, solo que a su historial de procesos o a su checklist.

export async function logProcesoCreate(actor, proceso, proveedorNombre) {
  const changes = diffFields(null, proceso, PROVEEDOR_PROCESO_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "proveedor", recordId: proceso.proveedorNit, recordInfo: `${proceso.proceso} — ${proveedorNombre}`, actor, changes });
}

export async function logProcesoUpdate(actor, before, after, proveedorNombre) {
  const changes = diffFields(before, after, PROVEEDOR_PROCESO_FIELD_LABELS);
  if (!changes.length) return;
  const action = changes.length === 1 && changes[0].field === "radicado" ? "radicar" : "editar";
  await writeLog({ action, entityType: "proveedor", recordId: after.proveedorNit, recordInfo: `${after.proceso} — ${proveedorNombre}`, actor, changes });
}

export async function logChecklistUpdate(actor, before, after, proveedorNombre) {
  const changes = diffFields(before, after, PROVEEDOR_CHECKLIST_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "proveedor", recordId: after.proveedorNit, recordInfo: `Checklist — ${proveedorNombre}`, actor, changes });
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

// ---------- Roles personalizados (ver lib/rolesPersonalizados.js) ----------

export async function logRolCreate(actor, rol) {
  const changes = diffFields(null, rol, ROL_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "rol", recordId: rol.clave, recordInfo: `Rol "${rol.nombre}"`, actor, changes });
}

export async function logRolUpdate(actor, before, after) {
  const changes = diffFields(before, after, { nombre: ROL_FIELD_LABELS.nombre, descripcion: ROL_FIELD_LABELS.descripcion });
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "rol", recordId: after.clave, recordInfo: `Rol "${after.nombre}"`, actor, changes });
}

export async function logRolDelete(actor, rol) {
  const changes = diffFields(rol, null, ROL_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "rol", recordId: rol.clave, recordInfo: `Rol "${rol.nombre}"`, actor, changes });
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

// Ediciones del Estudio de informes (ver lib/reportEdiciones.js). recordId = el informe, así la pestaña "Ediciones"
// muestra en un solo historial la actividad del informe y la de todas sus ediciones.
const ESTADO_EDICION = { guardado: "guardada como foto", por_enviar: "lista para enviar", enviado: "enviada", omitido: "omitida (no se cumplió la condición)", error: "con error" };

export async function logEdicionGenerada(actor, report, ed) {
  const origen = ed.origen === "prueba" ? "de prueba " : ed.origen === "manual" ? "manual " : ed.origen === "foto" ? "(foto) " : "";
  await writeLog({
    action: "generar",
    entityType: "informeEdicion",
    recordId: report.id,
    recordInfo: `Informe "${report.nombre}" · edición ${origen}${ed.periodoLabel} ${ESTADO_EDICION[ed.estado] || ed.estado}${ed.motivo ? ` — ${ed.motivo}` : ""}`,
    actor: actor || { nombre: "Programación automática" },
    changes: null,
  });
}

export async function logEdicionDescargada(actor, report, ed) {
  await writeLog({
    action: "descargar",
    entityType: "informeEdicion",
    recordId: report?.id || ed.reportId,
    recordInfo: `Informe "${report?.nombre || ""}" · descargó el PDF de ${ed.periodoLabel}`,
    actor,
    changes: null,
  });
}

export async function logEdicionEnviada(actor, report, ed) {
  const destinos = (() => { try { return JSON.parse(ed.destinatarios || "[]").join(", "); } catch { return ""; } })();
  await writeLog({
    action: "enviar",
    entityType: "informeEdicion",
    recordId: report?.id || ed.reportId,
    recordInfo: `Informe "${report?.nombre || ""}" · edición ${ed.periodoLabel} ${actor ? "marcada como enviada" : "enviada por correo automático"}${destinos ? ` a ${destinos}` : ""}`,
    actor: actor || { nombre: "Correo automático" },
    changes: null,
  });
}

export async function listAuditLogs({ from, to, userId, recordId, action, entityType, page = 1, pageSize = 50 } = {}) {
  const where = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999`);
  }
  if (userId) where.userId = userId;
  if (recordId) where.recordId = recordId;
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;

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

// ---------- Calificación de proveedor ----------

function calificacionSummary(c) {
  if (!c) return null;
  const estrellas = "★".repeat(c.estrellas || 0) + "☆".repeat(5 - (c.estrellas || 0));
  return `${c.proveedor || "Proveedor"} — ${estrellas}`;
}

export async function logCalificacionUpsert(actor, before, after) {
  const changes = diffFields(before, after, CALIFICACION_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({
    action: before ? "editar" : "crear",
    entityType: "calificacion",
    recordId: after.recordId,
    recordInfo: calificacionSummary(after),
    actor,
    changes,
  });
}

// ---------- Valoración IA de compras radicadas ----------

export async function logValoracionUpsert(actor, before, after, registroInfo) {
  const changes = diffFields(before, after, VALORACION_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({
    action: before ? "editar" : "crear",
    entityType: "valoracion",
    recordId: after.recordId,
    recordInfo: `${registroInfo || "Compra"} — compra ${after.puntajeCompra}/5${after.puntajeProveedor != null ? `, proveedor ${after.puntajeProveedor}/5` : ""}`,
    actor,
    changes,
  });
}

// Resumen de una pasada de valoración automática (carga masiva de compras ya radicadas).
export async function logValoracionMasiva(valoradas, conError, promedioCompra) {
  await writeLog({
    action: "crear",
    entityType: "valoracion",
    recordId: `carga-masiva-${Date.now()}`,
    recordInfo: `Valoración masiva de Nova: ${valoradas} compra(s) valorada(s)${conError ? `, ${conError} con error` : ""}${promedioCompra != null ? ` · promedio ${promedioCompra.toFixed(2)}/5` : ""}`,
    actor: { nombre: "Valoración masiva" },
    changes: [],
  });
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

// ---------- Ciclo anual de proveedores ----------
// El histórico del ciclo (estado, checklist y configuración) se audita con el
// mismo entityType "proveedor" o "cicloProveedor"/"configProveedores" según el caso.

export async function logCicloEstado(actor, proveedor, anio, before, after) {
  const changes = diffFields(before, after, CICLO_PROVEEDOR_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "cicloProveedor", recordId: proveedor.nit, recordInfo: `Ciclo ${anio} — ${proveedorSummary(proveedor)}`, actor, changes });
}

export async function logCicloDocumento(actor, proveedor, anio, clave, before, after) {
  const label = CICLO_PROVEEDOR_FIELD_LABELS[clave] || clave;
  const changes = [{ field: clave, label, before: before ?? null, after: after ?? null }];
  await writeLog({ action: "editar", entityType: "cicloProveedor", recordId: proveedor.nit, recordInfo: `Checklist ${anio} — ${proveedorSummary(proveedor)}`, actor, changes });
}

export async function logCicloIniciado(anio, cantidad) {
  await writeLog({
    action: "crear",
    entityType: "cicloProveedor",
    recordId: `ciclo-${anio}`,
    recordInfo: `Inicio del ciclo ${anio} · ${cantidad} proveedores desactualizados`,
    actor: null,
    changes: [],
  });
}

export async function logProveedorClasificacion(actor, proveedor, accion, detalle) {
  await writeLog({ action: "editar", entityType: "proveedor", recordId: proveedor.nit, recordInfo: `${accion} — ${proveedorSummary(proveedor)}`, actor, changes: detalle ? [{ field: "clasificacion", label: "Clasificación", before: null, after: detalle }] : [] });
}

export async function logConfigProveedoresUpdate(actor, before, after) {
  const changes = diffFields(before, after, CONFIG_PROVEEDORES_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "configProveedores", recordId: "config", recordInfo: "Ciclo de actualización de proveedores", actor, changes });
}

// ---------- Tokens de acceso (MCP) ----------
// Nunca se audita el token ni su hash — solo nombre, prefijo, vencimiento y estado.

const tokenSummary = (t) => `Token "${t.nombre}" (${t.prefijo}…)${t.dueno?.nombre ? ` de ${t.dueno.nombre}` : ""}`;

export async function logTokenCreate(actor, token) {
  const changes = diffFields(null, { ...token, expiraAt: token.expiraAt?.toISOString?.().slice(0, 10) }, TOKEN_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "tokenAcceso", recordId: String(token.id), recordInfo: tokenSummary(token), actor, changes });
}

export async function logTokenRevoke(actor, before, after) {
  const changes = diffFields(before, after, { estado: TOKEN_FIELD_LABELS.estado });
  await writeLog({ action: "revocar", entityType: "tokenAcceso", recordId: String(after.id), recordInfo: tokenSummary(after), actor, changes });
}

// Cada herramienta que Claude ejecuta a nombre de una persona (solo lectura): quién, qué y con qué filtros.
export async function logMcpConsulta(actor, tool, args) {
  const resumen = JSON.stringify(args || {}).slice(0, 300);
  await writeLog({ action: "consultar", entityType: "mcp", recordId: String(actor?.tokenId ?? "mcp"), recordInfo: `${tool} ${resumen}`, actor });
}

// ---------- Notificaciones configurables ----------
// Los objetos vienen ya "aplanados" para auditoría (ver lib/notificaciones.js#paraAuditoria): textos legibles
// para la programación, canales y destinatarios. Los envíos programados NO se auditan (volumen): su historial
// está en NotificacionEjecucion/NotificacionEntrega. Sí se auditan las pruebas y los envíos manuales.

const notificacionSummary = (n) => `Notificación "${n.nombre}"${n.propietarioNombre ? ` de ${n.propietarioNombre}` : ""}`;

export async function logNotificacionCreate(actor, n) {
  const changes = diffFields(null, n, NOTIFICACION_FIELD_LABELS);
  await writeLog({ action: "crear", entityType: "notificacion", recordId: String(n.id), recordInfo: notificacionSummary(n), actor, changes });
}

export async function logNotificacionUpdate(actor, before, after) {
  const changes = diffFields(before, after, NOTIFICACION_FIELD_LABELS);
  if (!changes.length) return;
  await writeLog({ action: "editar", entityType: "notificacion", recordId: String(after.id), recordInfo: notificacionSummary(after), actor, changes });
}

export async function logNotificacionDelete(actor, n) {
  const changes = diffFields(n, null, NOTIFICACION_FIELD_LABELS);
  await writeLog({ action: "eliminar", entityType: "notificacion", recordId: String(n.id), recordInfo: notificacionSummary(n), actor, changes });
}

// action: "pausar" | "reanudar". actor null = el sistema (pausa automática por permisos).
export async function logNotificacionEstado(actor, n, action, before, after, motivo) {
  const changes = [{ field: "estado", label: NOTIFICACION_FIELD_LABELS.estado, before, after }];
  if (motivo) changes.push({ field: "motivoPausa", label: NOTIFICACION_FIELD_LABELS.motivoPausa, before: null, after: motivo });
  await writeLog({ action, entityType: "notificacion", recordId: String(n.id), recordInfo: notificacionSummary(n), actor: actor || { nombre: "Sistema (permisos)" }, changes });
}

// action: "probar" | "enviar" (envío manual inmediato). detalle: resultado legible.
export async function logNotificacionEnvio(actor, n, action, detalle) {
  await writeLog({ action, entityType: "notificacion", recordId: String(n.id), recordInfo: `${notificacionSummary(n)} · ${detalle}`, actor, changes: null });
}

// action: "baja" (deja de recibir) | "alta" (vuelve a recibir).
export async function logNotificacionSuscripcion(actor, n, action, personaNombre) {
  const changes = [{ field: "destinatariosTexto", label: NOTIFICACION_FIELD_LABELS.destinatariosTexto, before: action === "baja" ? personaNombre : null, after: action === "alta" ? personaNombre : null }];
  await writeLog({ action, entityType: "notificacion", recordId: String(n.id), recordInfo: `${notificacionSummary(n)} · ${personaNombre} ${action === "baja" ? "dejó de recibirla" : "vuelve a recibirla"}`, actor, changes });
}

// ---------- Correo vinculado y agente de correo (solicitudes de proveedor) ----------
// Nunca se auditan los tokens: solo el buzón, el estado y el encendido del agente.

export async function logCuentaCorreo(actor, action, cuenta, before = null, after = null) {
  const changes = diffFields(before, after, CUENTA_CORREO_FIELD_LABELS);
  await writeLog({ action, entityType: "cuentaCorreo", recordId: String(cuenta.id), recordInfo: `Correo ${cuenta.email} de ${cuenta.userNombre}`, actor, changes });
}

const solicitudCorreoSummary = (s) => `Solicitud de proveedor del correo «${s.asunto || "sin asunto"}»${s.userNombre ? ` (buzón de ${s.userNombre})` : ""}`;

export async function logSolicitudProveedorCorreo(actor, action, s, before = null, after = null) {
  const changes = diffFields(before, after, SOLICITUD_PROVEEDOR_CORREO_FIELD_LABELS);
  await writeLog({ action, entityType: "solicitudProveedorCorreo", recordId: String(s.id), recordInfo: solicitudCorreoSummary(s), actor, changes });
}

// ---------- Tesorería (flujo de caja, soportes, conciliación y cierre; ver lib/tesoreria/*) ----------
// Un solo punto de entrada: cada cambio del módulo queda con su entidad (ENTITY_LABELS) y el diff por campos.
const TESORERIA_LABELS = {
  movimientoTesoreria: MOVIMIENTO_TESORERIA_FIELD_LABELS,
  maestroTesoreria: MAESTRO_TESORERIA_FIELD_LABELS,
  accesoTesoreria: ACCESO_TESORERIA_FIELD_LABELS,
  conciliacionTesoreria: CONCILIACION_TESORERIA_FIELD_LABELS,
  cierreTesoreria: CIERRE_TESORERIA_FIELD_LABELS,
  extractoTesoreria: EXTRACTO_TESORERIA_FIELD_LABELS,
  soporteTesoreria: SOPORTE_TESORERIA_FIELD_LABELS,
};

export async function logTesoreria(actor, { action, entityType, recordId, recordInfo, before = null, after = null }) {
  const changes = diffFields(before, after, TESORERIA_LABELS[entityType] || {});
  await writeLog({ action, entityType, recordId: String(recordId), recordInfo, actor, changes });
}
