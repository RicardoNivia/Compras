import { prisma } from "@/lib/prisma";
import { ymd } from "@/lib/reportSchedule";
import { EVENTOS, ESTADOS_CICLO } from "@/lib/notificacionesCatalogo";
import { businessDaysBetween } from "@/lib/businessDays";
import { FIELD_LABELS, PROVEEDOR_FIELD_LABELS } from "@/lib/auditLabels";

// Fase 2 de notificaciones: eventos (ver docs/notificaciones-diseno.md §6.2).
//
// 1. publicarEvento(): las librerías que escriben (records, calificaciones, proveedores…) anotan el hecho en
//    EventoNotificacion. Nunca lanza ni bloquea la escritura original; `clave` única evita anotarlo dos veces.
// 2. procesarEventos(): cruza los eventos nuevos con las notificaciones activas "por evento". Las de agrupación
//    "inmediato" se envían ya (una ejecución por evento); las agrupadas las recoge el programador (lotesPendientes).
// 3. detectarValoraciones() y revisarUmbralPresupuesto(): eventos que no nacen en una sola escritura (la valoración
//    la puede guardar la app, el proceso automático o un script; el umbral depende del total del área).

const fmtCOP = (n) => `$${Math.round(n || 0).toLocaleString("es-CO")}`;
const parse = (s, f) => { try { return s ? JSON.parse(s) : f; } catch { return f; } };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Datos mínimos de una compra para el mensaje y los filtros (snapshot del momento del evento).
export function datosCompra(r) {
  if (!r) return {};
  return {
    recordId: r.id, localSeq: r.localSeq ?? null, descripcion: r.descripcion || null, proveedor: r.proveedor || null,
    proveedorNit: r.proveedorNit || null, area: r.area || null, valorConIva: r.valorConIva ?? null,
    responsableUserId: r.responsableUserId || null, responsable: r.responsable || null, estado: r.estado || null,
    fechaSolicitud: r.fechaSolicitud || null, fechaEntrega: r.fechaEntrega || null, observaciones: r.observaciones || null,
  };
}

// Qué cambió entre dos versiones, con las mismas etiquetas de la auditoría: [{ campo, antes, despues }].
const SIN_NOTIFICAR = new Set(["creadoPorNombre", "datosBorrados", "id", "localSeq"]);
const legible = (v) => {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("es-CO") : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};
// Campos de catálogo de una compra: el texto guardado es una foto y al leer se muestra el nombre actual, así que solo
// cuenta como cambio si cambió el valor elegido (su id). Los ids nunca se muestran.
const ID_DE_CAMPO = { area: "areaId", responsable: "responsableUserId", estado: "estadoId", categoria: "categoriaId", medioPago: "medioPagoId", estadoLegalizacion: "estadoLegalizacionId", proveedor: "proveedorNit", actividad: "actividadId" };
const SOLO_INTERNOS = new Set([...Object.values(ID_DE_CAMPO), "nit"]);

export function cambiosEntre(antes, despues, etiquetas) {
  const out = [];
  for (const [k, campo] of Object.entries(etiquetas)) {
    if (SIN_NOTIFICAR.has(k)) continue;
    const idCampo = ID_DE_CAMPO[k];
    if (etiquetas === FIELD_LABELS) {
      if (SOLO_INTERNOS.has(k)) continue;
      if (idCampo && (antes?.[idCampo] || despues?.[idCampo]) && antes?.[idCampo] === despues?.[idCampo]) continue;
    }
    const a = legible(antes?.[k]);
    const d = legible(despues?.[k]);
    if (a !== d) out.push({ campo, antes: a, despues: d });
  }
  return out;
}

// silencioso: se anota ya procesado (no notifica); sirve para marcar un hecho como ocurrido sin avisarlo.
export async function publicarEvento(tipo, { entidadId, clave, datos, actor, silencioso = false } = {}) {
  try {
    if (!EVENTOS[tipo]) return;
    // createMany + skipDuplicates: si la clave ya existe (p. ej. el tope ya se avisó este año) se omite sin error.
    const { count } = await prisma.eventoNotificacion.createMany({
      skipDuplicates: true,
      data: {
        tipo,
        clave: clave || `${tipo}|${entidadId}|${Date.now()}`,
        entidadId: String(entidadId ?? ""),
        datos: JSON.stringify(datos || {}),
        creadoPorUserId: actor?.id || null,
        creadoPorNombre: actor?.nombre || "Proceso automático",
        procesadoAt: silencioso ? new Date() : null,
      },
    });
    if (count && !silencioso) setTimeout(() => procesarEventos().catch(() => {}), 300);
  } catch {
    // P2002 (ya anotado) o BD no disponible: nunca debe afectar la escritura que originó el evento
  }
}

// Compara un registro antes/después de guardarlo y publica lo que cambió (lo llama lib/records.js).
export function publicarCambiosDeCompra(before, after, actor) {
  if (!after) return;
  const d = datosCompra(after);
  const id = after.id;
  if (!before) {
    publicarEvento("compra.creada", { entidadId: id, clave: `compra.creada|${id}`, datos: d, actor });
    return;
  }
  const marca = Date.now();
  if (after.estadoLegalizacion === "Legalizado" && before.estadoLegalizacion !== "Legalizado") publicarEvento("compra.legalizada", { entidadId: id, clave: `compra.legalizada|${id}|${marca}`, datos: d, actor });
  if (after.estadoLegalizacion === "Rechazado" && before.estadoLegalizacion !== "Rechazado") publicarEvento("compra.rechazada", { entidadId: id, clave: `compra.rechazada|${id}|${marca}`, datos: d, actor });
  if (after.radicado && !before.radicado) publicarEvento("compra.radicada", { entidadId: id, clave: `compra.radicada|${id}`, datos: d, actor });
  if (after.fechaEntrega && !before.fechaEntrega) {
    const dias = businessDaysBetween(after.fechaSolicitud, after.fechaEntrega);
    publicarEvento("compra.entregada", { entidadId: id, clave: `compra.entregada|${id}|${after.fechaEntrega}`, datos: { ...d, diasHabiles: dias, fueraDePlazo: dias != null && dias > 8 }, actor });
  }
  const cambios = cambiosEntre(before, after, FIELD_LABELS);
  if (cambios.length) publicarEvento("compra.actualizada", { entidadId: id, clave: `compra.actualizada|${id}|${marca}`, datos: { ...d, cambios, actualizadoPor: actor?.nombre || null }, actor });
  if (after.estado === "Anulado" && before.estado !== "Anulado") publicarEvento("compra.anulada", { entidadId: id, clave: `compra.anulada|${id}|${marca}`, datos: d, actor });
}

// Proveedor editado (formulario o clasificación): un evento con todo lo que cambió.
export function publicarCambiosDeProveedor(before, after, actor) {
  if (!before || !after) return;
  const cambios = cambiosEntre(before, after, PROVEEDOR_FIELD_LABELS);
  if (!cambios.length) return;
  publicarEvento("proveedor.actualizado", {
    entidadId: after.nit,
    clave: `proveedor.actualizado|${after.nit}|${Date.now()}`,
    datos: { nit: after.nit, nombre: after.nombre, area: after.area || null, criticidad: after.criticidad || null, cambios, actualizadoPor: actor?.nombre || null },
    actor,
  });
}

// Presupuesto creado, modificado o eliminado (accion: "creado" | "modificado" | "eliminado"), o modo del año cambiado.
// before/after: forma cliente de lib/presupuestos.js#toClientPresupuesto (con total y categorías).
export function publicarCambioPresupuesto(accion, before, after, actor, extra = {}) {
  const p = after || before || {};
  const cambios = [];
  if (accion === "modo") {
    cambios.push({ campo: "Modo del año", antes: extra.modoAnterior === "categoria" ? "Por categoría" : "Por área", despues: extra.modoNuevo === "categoria" ? "Por categoría" : "Por área" });
  } else {
    const total = (x) => (x ? fmtCOP(x.total || 0) : "—");
    if (total(before) !== total(after)) cambios.push({ campo: "Total", antes: total(before), despues: total(after) });
    const cat = (x) => new Map((x?.categorias || []).map((c) => [c.categoria, fmtCOP(c.valor)]));
    const a = cat(before);
    const d = cat(after);
    for (const k of new Set([...a.keys(), ...d.keys()])) if (a.get(k) !== d.get(k)) cambios.push({ campo: k, antes: a.get(k) || "—", despues: d.get(k) || "—" });
  }
  if (!cambios.length) return;
  const anio = p.anio ?? extra.anio;
  publicarEvento("presupuesto.actualizado", {
    entidadId: p.id || `anio-${anio}`,
    clave: `presupuesto.actualizado|${p.area || "anio"}|${anio}|${Date.now()}`,
    datos: { accion, area: p.area || null, anio, total: after?.total ?? null, cambios, actualizadoPor: actor?.nombre || null, presupuestosBorrados: extra.borrados || 0 },
    actor,
  });
}

// ---------- Detección por barrido ----------

// Valoraciones de Nova creadas o regeneradas desde la última revisión (cualquier origen: app, automática, script).
export async function detectarValoraciones() {
  const marca = globalThis.__notifValoracionesDesde || (globalThis.__notifValoracionesDesde = new Date());
  const ahora = new Date();
  const nuevas = await prisma.valoracionCompra.findMany({
    where: { updatedAt: { gt: marca, lte: ahora } },
    include: { record: true },
    take: 200,
    orderBy: { updatedAt: "asc" },
  });
  globalThis.__notifValoracionesDesde = nuevas.length === 200 ? nuevas[nuevas.length - 1].updatedAt : ahora;
  for (const v of nuevas) {
    await publicarEvento("compra.valorada", {
      entidadId: v.recordId,
      clave: `compra.valorada|${v.recordId}|${v.updatedAt.toISOString()}`,
      datos: { ...datosCompra(v.record), puntajeCompra: v.puntajeCompra, puntajeProveedor: v.puntajeProveedor, resumen: v.resumen },
      actor: v.creadoPorUserId ? { id: v.creadoPorUserId, nombre: v.creadoPorNombre } : null,
    });
  }
}

// Umbrales de presupuesto (80 % y 100 %) en tres niveles, para el año en curso: general (todas las áreas con
// presupuesto), el área de la compra y, si el año está configurado por categoría, la categoría de esa área.
// Cada nivel avisa una sola vez por año y umbral (la clave única del evento lo garantiza). El gasto se mide igual que
// en Mi día y en el Dashboard (lib/alerts.js#getRiesgoPresupuesto): suma del valor con IVA por fecha de solicitud.
export async function revisarUmbralPresupuesto(area, categoria = null) {
  try {
    const { listRecords } = await import("@/lib/records");
    const { listPresupuestos } = await import("@/lib/presupuestos");
    const anio = new Date().getFullYear();
    const { presupuestos, modo } = await listPresupuestos({ anio });
    if (!presupuestos.length) return;
    const delAnio = (await listRecords()).filter((r) => Number(String(r.fechaSolicitud || "").slice(0, 4)) === anio);
    const suma = (lista) => lista.reduce((t, r) => t + (r.valorConIva || 0), 0);
    const pct = (gastado, total) => (total > 0 ? Math.round((gastado / total) * 1000) / 10 : null);

    const avisar = async (nivel, clave, datos) => {
      if (datos.porcentaje == null) return;
      // Si de una vez pasa el 100 %, solo se avisa "se excedió"; el 80 % queda marcado como ocurrido sin avisarlo.
      const excedido = datos.porcentaje >= 100;
      for (const umbral of [100, 80]) {
        if (datos.porcentaje < umbral) continue;
        await publicarEvento("presupuesto.umbral", { entidadId: clave, clave: `presupuesto.umbral|${clave}|${anio}|${umbral}`, datos: { ...datos, nivel, anio, umbral }, silencioso: umbral === 80 && excedido });
      }
    };

    // General: el gasto de las áreas que tienen presupuesto frente a la suma de sus presupuestos.
    // Áreas por su nombre exacto, igual que Mi día y el Dashboard (lib/alerts.js): "Gentesoft" y "GenteSoft" pueden ser áreas distintas.
    const areasConPresupuesto = new Set(presupuestos.map((p) => p.area));
    const totalGeneral = presupuestos.reduce((t, p) => t + (p.total || 0), 0);
    const gastadoGeneral = suma(delAnio.filter((r) => areasConPresupuesto.has(r.area)));
    await avisar("general", "general", { area: null, categoria: null, gastado: gastadoGeneral, presupuestado: totalGeneral, porcentaje: pct(gastadoGeneral, totalGeneral) });

    if (!area) return;
    const p = presupuestos.find((x) => x.area === area);
    if (!p) return;
    const delArea = delAnio.filter((r) => r.area === p.area);
    const gastadoArea = suma(delArea);
    await avisar("area", `area|${p.area}`, { area: p.area, categoria: null, gastado: gastadoArea, presupuestado: p.total, porcentaje: pct(gastadoArea, p.total) });

    if (modo !== "categoria" || !categoria) return;
    const c = (p.categorias || []).find((x) => x.categoria === categoria);
    if (!c) return;
    const gastadoCat = suma(delArea.filter((r) => r.categoria === c.categoria));
    await avisar("categoria", `categoria|${p.area}|${c.categoria}`, { area: p.area, categoria: c.categoria, gastado: gastadoCat, presupuestado: c.valor, porcentaje: pct(gastadoCat, c.valor) });
  } catch {
    // nunca afecta la escritura
  }
}

// ---------- Cruce con las notificaciones ----------

export function cumpleFiltros(n, ev) {
  const p = parse(n.parametros, {});
  const d = typeof ev.datos === "string" ? parse(ev.datos, {}) : ev.datos || {};
  // "todas" guardado por error antes de la validación (esSinFiltro) no filtra.
  if (p.area && !/^\s*(tod[oa]s?|cualquier[ae]?)\b/i.test(p.area) && norm(d.area) !== norm(p.area)) return false;
  if (p.puntajeMax != null && !(d.puntajeCompra <= p.puntajeMax || (d.puntajeProveedor != null && d.puntajeProveedor <= p.puntajeMax))) return false;
  if (p.estrellasMax != null && !(d.estrellas <= p.estrellasMax)) return false;
  if (p.soloFueraDePlazo && !d.fueraDePlazo) return false;
  if (p.estadoCiclo && d.a !== p.estadoCiclo) return false;
  if (p.nivel && (d.nivel || "area") !== p.nivel) return false;
  if (p.proveedor) {
    const buscado = norm(p.proveedor);
    const nit = norm(d.proveedorNit || d.nit);
    const nombre = norm(d.proveedor || d.nombre);
    const esNit = /^[0-9.\-\s]+$/.test(p.proveedor);
    if (esNit ? nit.replace(/[^0-9a-z]/g, "") !== buscado.replace(/[^0-9a-z]/g, "") : !nombre.includes(buscado)) return false;
  }
  if (p.soloExcedido && !(d.umbral >= 100)) return false;
  return true;
}

// Ítem del mensaje para un evento.
export function itemDeEvento(ev) {
  const d = typeof ev.datos === "string" ? parse(ev.datos, {}) : ev.datos || {};
  const ref = d.localSeq ? `#${d.localSeq}` : "";
  const href = d.localSeq ? `/registros?q=${encodeURIComponent(`#${d.localSeq}`)}` : "/registros";
  switch (ev.tipo) {
    case "compra.valorada":
      return { ref, titulo: d.descripcion || "(sin descripción)", contexto: [d.proveedor, d.area].filter(Boolean).join(" · "), detalle: `Compra ${d.puntajeCompra}/5${d.puntajeProveedor != null ? ` · proveedor ${d.puntajeProveedor}/5` : ""}${d.resumen ? ` · ${d.resumen}` : ""}`, dato: `${d.puntajeCompra}/5`, href };
    case "compra.calificada":
      return { ref, titulo: d.descripcion || "(sin descripción)", contexto: [d.proveedor, d.area].filter(Boolean).join(" · "), detalle: `${"★".repeat(d.estrellas || 0)}${"☆".repeat(5 - (d.estrellas || 0))}${d.comentario ? ` · ${d.comentario}` : ""}${d.calificadoPor ? ` · por ${d.calificadoPor}` : ""}`, dato: `${d.estrellas}★`, href };
    case "compra.entregada":
      return { ref, titulo: d.descripcion || "(sin descripción)", contexto: [d.proveedor, d.area].filter(Boolean).join(" · "), detalle: d.diasHabiles != null ? `${d.diasHabiles} días hábiles${d.fueraDePlazo ? " · fuera del plazo de 8" : " · a tiempo"}` : "", dato: d.valorConIva != null ? fmtCOP(d.valorConIva) : null, href };
    case "compra.rechazada":
      return { ref, titulo: d.descripcion || "(sin descripción)", contexto: [d.proveedor, d.area].filter(Boolean).join(" · "), detalle: d.observaciones ? `Rechazada · ${d.observaciones}` : "Rechazada", dato: d.valorConIva != null ? fmtCOP(d.valorConIva) : null, href };
    case "compra.eliminada":
      return { ref, titulo: d.descripcion || "(sin descripción)", contexto: [d.proveedor, d.area].filter(Boolean).join(" · "), detalle: `Eliminada${d.eliminadaPor ? ` por ${d.eliminadaPor}` : ""}${d.estado ? ` · estaba ${d.estado}` : ""}`, dato: d.valorConIva != null ? fmtCOP(d.valorConIva) : null, href: null };
    case "compra.actualizada": {
      const lista = (d.cambios || []).slice(0, 4).map((c) => `${c.campo}: ${c.antes} → ${c.despues}`).join(" · ");
      const mas = (d.cambios || []).length > 4 ? ` · y ${d.cambios.length - 4} más` : "";
      return { ref, titulo: d.descripcion || "(sin descripción)", contexto: [d.proveedor, d.area].filter(Boolean).join(" · "), detalle: `${lista}${mas}${d.actualizadoPor ? ` · por ${d.actualizadoPor}` : ""}`, dato: d.valorConIva != null ? fmtCOP(d.valorConIva) : null, href };
    }
    case "proveedor.actualizado": {
      const lista = (d.cambios || []).slice(0, 4).map((c) => `${c.campo}: ${c.antes} → ${c.despues}`).join(" · ");
      const mas = (d.cambios || []).length > 4 ? ` · y ${d.cambios.length - 4} más` : "";
      return { ref: d.nit, titulo: d.nombre, contexto: [d.area, d.criticidad].filter(Boolean).join(" · "), detalle: `${lista}${mas}${d.actualizadoPor ? ` · por ${d.actualizadoPor}` : ""}`, dato: null, href: `/proveedores?q=${encodeURIComponent(d.nit || "")}` };
    }
    case "proveedor.eliminado":
      return { ref: d.nit, titulo: d.nombre, contexto: [d.area, d.criticidad].filter(Boolean).join(" · "), detalle: `Eliminado del catálogo${d.eliminadoPor ? ` por ${d.eliminadoPor}` : ""}`, dato: null, href: null };
    case "proveedor.creado":
      return { ref: d.nit, titulo: d.nombre, contexto: [d.area, d.criticidad].filter(Boolean).join(" · "), detalle: "Nuevo en el catálogo", dato: null, href: `/proveedores?q=${encodeURIComponent(d.nit || "")}` };
    case "proveedor.ciclo_cambio":
      return { ref: d.nit, titulo: d.nombre, contexto: `Ciclo ${d.anio || ""}`, detalle: `${ESTADOS_CICLO[d.de] || d.de || "—"} → ${ESTADOS_CICLO[d.a] || d.a}`, dato: null, href: `/proveedores?q=${encodeURIComponent(d.nit || "")}` };
    case "presupuesto.actualizado": {
      const titulo = d.accion === "modo" ? `Presupuesto ${d.anio}` : `${d.area} · ${d.anio}`;
      const que = { creado: "Se configuró", modificado: "Se modificó", eliminado: "Se eliminó", modo: "Cambió el modo" }[d.accion] || "Cambió";
      const lista = (d.cambios || []).slice(0, 4).map((c) => `${c.campo}: ${c.antes} → ${c.despues}`).join(" · ");
      const mas = (d.cambios || []).length > 4 ? ` · y ${d.cambios.length - 4} más` : "";
      const borrados = d.accion === "modo" && d.presupuestosBorrados ? ` · se borraron ${d.presupuestosBorrados} presupuesto(s)` : "";
      return { ref: d.accion === "eliminado" ? "Eliminado" : "", titulo, contexto: que, detalle: `${lista}${mas}${borrados}${d.actualizadoPor ? ` · por ${d.actualizadoPor}` : ""}`, dato: d.total != null ? fmtCOP(d.total) : null, href: "/presupuesto" };
    }
    case "presupuesto.umbral": {
      const nivel = d.nivel || "area";
      const titulo = nivel === "general" ? "Presupuesto general" : nivel === "categoria" ? `${d.area} · ${d.categoria}` : d.area;
      const que = nivel === "general" ? "general" : nivel === "categoria" ? "de la categoría" : "del área";
      return { ref: `${d.porcentaje}%`, titulo, contexto: `Presupuesto ${que} ${d.anio}`, detalle: `${d.umbral >= 100 ? "Se excedió" : "Superó el 80 %"} · gastado ${fmtCOP(d.gastado)} de ${fmtCOP(d.presupuestado)}`, dato: `${d.porcentaje}%`, href: "/presupuesto" };
    }
    default:
      return { ref, titulo: d.descripcion || "(sin descripción)", contexto: [d.proveedor, d.area, d.responsable].filter(Boolean).join(" · "), detalle: d.estado || "", dato: d.valorConIva != null ? fmtCOP(d.valorConIva) : null, href };
  }
}

// Resultado (mismo formato que una consulta) a partir de una lista de eventos. Con alcance personal, solo los de
// compras de las que el destinatario es responsable.
export function resultadoDeEventos(n, eventos, destinatario = null) {
  let lista = eventos.map((e) => ({ ...e, datos: typeof e.datos === "string" ? parse(e.datos, {}) : e.datos }));
  if (n.alcance === "personal" && destinatario) lista = lista.filter((e) => e.datos.responsableUserId === destinatario.id);
  const ev = EVENTOS[n.evento];
  const d = lista[0]?.datos || {};
  const valores = {
    total: String(lista.length),
    evento: ev?.label || n.evento,
    numero: d.localSeq ? `#${d.localSeq}` : "",
    descripcion: d.descripcion || d.nombre || d.area || "",
    proveedor: d.proveedor || d.nombre || "",
    area: d.area || "",
    valor: d.valorConIva != null ? fmtCOP(d.valorConIva) : "",
    puntaje_compra: d.puntajeCompra != null ? String(d.puntajeCompra) : "",
    puntaje_proveedor: d.puntajeProveedor != null ? String(d.puntajeProveedor) : "",
    estrellas: d.estrellas != null ? String(d.estrellas) : "",
    detalle: lista[0] ? itemDeEvento(lista[0]).detalle : "",
  };
  const enlace = ev?.fuente === "proveedores" ? "/proveedores" : ev?.fuente === "presupuesto" ? "/presupuesto" : "/registros";
  return { total: lista.length, items: lista.map(itemDeEvento), valores, enlace };
}

// Procesa los eventos pendientes: los "inmediato" se envían ya; el resto queda para el lote.
export async function procesarEventos() {
  if (globalThis.__notifProcesando) return;
  globalThis.__notifProcesando = true;
  try {
    const { ejecutarNotificacion } = await import("@/lib/notificacionesMotor");
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const eventos = await prisma.eventoNotificacion.findMany({ where: { procesadoAt: null }, orderBy: { id: "asc" }, take: 100 });
      if (!eventos.length) break;
      const tipos = [...new Set(eventos.map((e) => e.tipo))];
      const notifs = await prisma.notificacion.findMany({ where: { estado: "activa", disparador: "evento", agrupacion: "inmediato", evento: { in: tipos } } });
      for (const ev of eventos) {
        for (const n of notifs.filter((x) => x.evento === ev.tipo && cumpleFiltros(x, ev))) {
          await ejecutarNotificacion(n.id, { origen: "evento", eventos: [ev], clave: `n${n.id}|evt:${ev.id}` }).catch((e) => console.error(`[notificaciones] evento ${ev.id} → ${n.id}: ${e?.message || e}`));
        }
      }
      await prisma.eventoNotificacion.updateMany({ where: { id: { in: eventos.map((e) => e.id) } }, data: { procesadoAt: new Date() } });
    }
  } finally {
    globalThis.__notifProcesando = false;
  }
}

// Lotes: "cada_15_min" (si pasaron 15 min desde el último envío y hubo eventos) y "resumen_diario" (a su hora).
export async function lotesPendientes(ahora = new Date(), esDiaDeEnvio) {
  const { ejecutarNotificacion } = await import("@/lib/notificacionesMotor");
  const notifs = await prisma.notificacion.findMany({ where: { estado: "activa", disparador: "evento", agrupacion: { in: ["cada_15_min", "resumen_diario"] } } });
  for (const n of notifs) {
    const desde = n.ultimaEjecucionAt || n.updatedAt || n.createdAt;
    let clave;
    if (n.agrupacion === "cada_15_min") {
      if (ahora - desde < 15 * 60000) continue;
      clave = `n${n.id}|lote|${Math.floor(ahora.getTime() / (15 * 60000))}`;
    } else {
      const [h, m] = String(n.hora || "18:00").split(":").map(Number);
      if (ahora.getHours() * 60 + ahora.getMinutes() < h * 60 + m) continue;
      if (!esDiaDeEnvio({ ...n, frecuencia: "diaria" }, ahora)) continue;
      clave = `n${n.id}|${ymd(ahora)}`;
      if (await prisma.notificacionEjecucion.findUnique({ where: { clave }, select: { id: true } })) continue;
    }
    const eventos = (await prisma.eventoNotificacion.findMany({ where: { tipo: n.evento, createdAt: { gt: desde, lte: ahora } }, orderBy: { id: "asc" }, take: 500 }))
      .filter((e) => cumpleFiltros(n, e));
    if (!eventos.length && n.agrupacion === "cada_15_min") continue; // sin novedades, ni se registra
    await ejecutarNotificacion(n.id, { origen: n.agrupacion === "resumen_diario" ? "programado" : "evento", eventos, clave, ahora }).catch((e) => console.error(`[notificaciones] lote ${n.id}: ${e?.message || e}`));
  }
}

export async function purgarEventos() {
  await prisma.eventoNotificacion.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 86400000) } } }).catch(() => {});
}
