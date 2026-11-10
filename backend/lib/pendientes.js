import { prisma } from "@/lib/prisma";
import { solicitudesPendientes } from "@/lib/solicitudesCompra";
import { listRecords } from "@/lib/records";
import { getSolicitudesPendientes, getRiesgoPresupuesto, getRiesgoTiempos } from "@/lib/alerts";
import { listMaestroProveedores, getConfigProveedores } from "@/lib/proveedoresCiclo";
import { esCritico } from "@/lib/proveedoresCicloReglas";
import { isRoleAllowed } from "@/lib/permissions";
import { businessDaysElapsedToToday } from "@/lib/businessDays";
import { edicionesPorEnviar } from "@/lib/reportEdiciones";
import { hoyColombia } from "@/lib/hoyColombia";

// "Mi día": motor ÚNICO de lo que le toca hacer a cada persona según su rol. Alimenta la página
// "Mi día y alertas", el contador del menú lateral y la herramienta "mis_pendientes" de Nova, así
// que las tres muestran siempre exactamente lo mismo. Reutiliza los cálculos de lib/alerts.js
// (solicitudes pendientes, SLA de 8 días hábiles, presupuesto) y del módulo de Proveedores.
//
// Cada sección es una lista de ítems normalizados:
//   { id, ref, titulo, contexto, dias, detalle, nivel, href, recordId?, mio }
//   nivel: "critico" | "atencion" | "info"

const NIVEL_ORDEN = { critico: 0, atencion: 1, info: 2 };
const ESTANCADO_DIAS = 15; // proveedor en proceso/aprobación sin movimiento
const FUERA_DE_PLAZO_VENTANA_DIAS = 60; // entregas tarde que aún se muestran
const VALORACION_BAJA = 2; // puntaje que se considera bajo
const VALORACION_VENTANA_DIAS = 90;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const refRegistro = (r) => (r.localSeq ? `#${r.localSeq}` : "—");
const hrefRegistro = (r) => (r.localSeq ? `/registros?q=${encodeURIComponent(`#${r.localSeq}`)}` : "/registros");
const hrefProveedor = (nit) => `/proveedores?q=${encodeURIComponent(nit)}`;

function itemRegistro(r, user, extra) {
  return {
    id: r.id,
    dato: null,
    ref: refRegistro(r),
    titulo: r.descripcion || "(sin descripción)",
    contexto: [r.proveedor, r.area].filter(Boolean).join(" · ") || "—",
    dias: null,
    detalle: "",
    nivel: "info",
    href: hrefRegistro(r),
    recordId: r.id,
    mio: !!user?.id && r.responsableUserId === user.id,
    ...extra,
  };
}

function itemProveedor(p, extra) {
  return {
    id: p.nit,
    dato: null,
    ref: p.nit,
    titulo: p.nombre,
    contexto: [p.area, p.criticidad].filter(Boolean).join(" · ") || "—",
    dias: null,
    detalle: "",
    nivel: "info",
    href: hrefProveedor(p.nit),
    mio: false,
    ...extra,
  };
}

// ---------- Constructores de cada sección ----------

const nivelPorDias = (d, critico, atencion) => (d == null ? "info" : d > critico ? "critico" : d > atencion ? "atencion" : "info");

// Compras ya legalizadas que faltan por radicar (el último paso del trámite).
function porRadicar(records, user) {
  return records
    .filter((r) => r.estadoLegalizacion === "Legalizado" && !r.radicado && r.estado !== "Anulado")
    .map((r) => {
      const dias = businessDaysElapsedToToday(r.fechaSolicitud);
      return itemRegistro(r, user, { dias, detalle: `Legalizada · solicitada hace ${dias ?? "?"} días hábiles`, nivel: nivelPorDias(dias, 15, 8) });
    })
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
}

// Compras ya entregadas/ejecutadas que aún no se legalizan.
function porLegalizar(records, user) {
  return records
    .filter((r) => r.estado === "Ejecutado" && !r.radicado && (!r.estadoLegalizacion || r.estadoLegalizacion === "Pendiente"))
    .map((r) => {
      const dias = businessDaysElapsedToToday(r.fechaEntrega || r.fechaSolicitud);
      return itemRegistro(r, user, {
        dias,
        detalle: `Ejecutada · legalización ${r.estadoLegalizacion || "sin iniciar"}${r.fe ? "" : " · sin factura (FE)"}`,
        nivel: nivelPorDias(dias, 8, 3),
      });
    })
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
}

// Legalizaciones rechazadas: hay que corregir y volver a presentar.
function rechazadas(records, user) {
  return records
    .filter((r) => r.estadoLegalizacion === "Rechazado" && !r.radicado && r.estado !== "Anulado")
    .map((r) => {
      const dias = businessDaysElapsedToToday(r.fechaSolicitud);
      return itemRegistro(r, user, { dias, detalle: r.observaciones ? `Rechazada · ${r.observaciones}` : "Rechazada: corregir y presentar de nuevo", nivel: "atencion" });
    })
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
}

// Solicitudes sin entregar: >8 días hábiles ya incumplen el SLA; >5 es alerta temprana.
async function atrasadas(records, user) {
  const lista = await getSolicitudesPendientes(records);
  return lista.map((r) => {
    const base = itemRegistro(r, user, {});
    return {
      ...base,
      contexto: [r.responsable, r.proveedor, r.area].filter(Boolean).join(" · ") || "—",
      dias: r.diasHabiles,
      detalle: `${r.estado || "Sin estado"}${r.observaciones ? ` · ${r.observaciones}` : ""}`,
      nivel: r.diasHabiles > 8 ? "critico" : r.diasHabiles > 5 ? "atencion" : "info",
      mio: !!user?.id && records.find((x) => x.id === r.id)?.responsableUserId === user.id,
    };
  });
}

// Entregas que ya llegaron fuera del plazo (histórico reciente): lectura para el admin.
async function fueraDePlazo(records, user) {
  const desde = diasAtras(FUERA_DE_PLAZO_VENTANA_DIAS);
  const lista = (await getRiesgoTiempos(records)).filter((r) => r.entregado && r.fechaEntrega >= desde);
  return lista.map((r) => itemRegistro(r, user, { dias: r.diasHabiles, detalle: "Entregada fuera del plazo de 8 días hábiles", nivel: r.diasHabiles > 15 ? "atencion" : "info" }));
}

async function presupuesto(records) {
  const filas = await getRiesgoPresupuesto(records);
  return filas
    .filter((p) => p.estado === "alerta" || p.estado === "excedido")
    .map((p) => ({
      id: `area-${p.area}`,
      ref: "Área",
      titulo: p.area,
      contexto: `Presupuesto ${p.anio}`,
      dias: null,
      dato: `${p.porcentaje}%`,
      detalle: `Gastado ${Math.round(p.gastado).toLocaleString("es-CO")} de ${Math.round(p.presupuestado).toLocaleString("es-CO")}`,
      nivel: p.estado === "excedido" ? "critico" : "atencion",
      href: "/presupuesto",
      mio: false,
    }));
}

// Compras que Nova valoró mal (compra o proveedor ≤ 2★) en los últimos 90 días.
function valoracionBaja(records, user) {
  const desde = diasAtras(VALORACION_VENTANA_DIAS);
  return records
    .filter((r) => r.valoracion && r.fechaSolicitud >= desde && (r.valoracion.puntajeCompra <= VALORACION_BAJA || (r.valoracion.puntajeProveedor != null && r.valoracion.puntajeProveedor <= VALORACION_BAJA)))
    .map((r) => itemRegistro(r, user, {
      detalle: `Nova: compra ${r.valoracion.puntajeCompra}★${r.valoracion.puntajeProveedor != null ? ` · proveedor ${r.valoracion.puntajeProveedor}★` : ""} — ver el porqué en Registros`,
      nivel: "atencion",
    }))
    .sort((a, b) => b.ref.localeCompare(a.ref, "es", { numeric: true }));
}

// Radicadas que todavía no tienen la valoración de Nova (p. ej. falló al radicar).
function radicadasSinValorar(records, user) {
  return records
    .filter((r) => r.radicado && !r.valoracion)
    .map((r) => itemRegistro(r, user, { detalle: "Radicada sin valoración de Nova: abre Registros y pulsa «Valorar»", nivel: "atencion" }));
}

// ----- Proveedores -----

const enCiclo = (p) => p.clasificacion === "actualizacion" || p.clasificacion === "nuevo";

function provDesactualizados(filas, ctx) {
  const urgente = ctx.diasParaCorte != null && ctx.diasParaCorte <= ctx.diasAviso;
  return filas
    .filter((p) => enCiclo(p) && p.ciclo?.estado === "desactualizado")
    .map((p) => itemProveedor(p, {
      detalle: `${p.clasificacionLabel} · ${urgente ? `corte en ${ctx.diasParaCorte} día(s)` : "sin iniciar la actualización"}${p.registrosCompras ? ` · ${p.registrosCompras} compra(s)` : ""}`,
      nivel: esCritico(p.criticidad) || urgente ? "critico" : "atencion",
    }))
    .sort((a, b) => NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel]);
}

async function provEstancados(filas, anio) {
  const limite = new Date(Date.now() - ESTANCADO_DIAS * 86400000);
  const ciclos = await prisma.proveedorCiclo.findMany({
    where: { anio, estado: { in: ["en_proceso", "en_aprobacion"] }, updatedAt: { lt: limite } },
    select: { proveedorNit: true, estado: true, updatedAt: true },
  });
  const porNit = new Map(filas.map((p) => [p.nit, p]));
  return ciclos
    .map((c) => {
      const p = porNit.get(c.proveedorNit);
      if (!p || !p.activo || p.esExcepcion) return null;
      const dias = Math.floor((Date.now() - c.updatedAt.getTime()) / 86400000);
      return itemProveedor(p, {
        dias,
        detalle: `${c.estado === "en_aprobacion" ? "En aprobación" : "En proceso"} sin cambios hace ${dias} días`,
        nivel: dias > 30 ? "critico" : "atencion",
      });
    })
    .filter(Boolean)
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
}

function provChecklist(filas) {
  return filas
    .filter((p) => enCiclo(p) && p.ciclo && p.ciclo.estado !== "desactualizado" && p.checklist.completos < p.checklist.total)
    .map((p) => itemProveedor(p, {
      detalle: `Checklist ${p.checklist.completos}/${p.checklist.total} · falta: ${p.checklist.faltan.join(", ")}`,
      nivel: "atencion",
    }));
}

function provPorRegistrar(filas) {
  return filas
    .filter((p) => p.clasificacion === "por_registrar")
    .map((p) => itemProveedor(p, {
      detalle: `NIT provisional${p.registrosCompras ? ` · usado en ${p.registrosCompras} compra(s)` : ""}: registrar su NIT real`,
      nivel: p.registrosCompras ? "atencion" : "info",
    }));
}

// ---------- Catálogo de secciones y qué ve cada rol ----------

// Informes del Estudio que ya se generaron y esperan que su responsable los envíe ("Lo envío yo").
async function informesPorEnviar(user) {
  const eds = await edicionesPorEnviar(user);
  return eds.map((e) => {
    const dias = Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 86400000);
    const n = e.destinatarios.length;
    return {
      id: `inf-${e.id}`,
      ref: e.periodoLabel,
      titulo: e.reportNombre || "Informe",
      contexto: e.origen === "prueba" ? "Prueba (solo para ti)" : n ? `Para ${n} persona(s)` : "Sin destinatarios",
      dias,
      detalle: `Generado el ${new Date(e.createdAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      nivel: dias >= 2 ? "atencion" : "info",
      href: `/informes/${e.reportId}?tab=ediciones`,
      accion: "enviarInforme",
      edicionId: e.id,
      mio: true,
    };
  });
}

async function solicitudesCompraPendientes() {
  const lista = await solicitudesPendientes();
  return lista.map((s) => {
    const dias = Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000);
    return {
      id: `sol-${s.id}`,
      ref: `Solicitud ${s.id}`,
      titulo: s.descripcion,
      contexto: `${s.actividad} · ${s.creadoPorNombre || "Bienestar"}`,
      dias,
      detalle: s.fechaRequerida ? `Para el ${s.fechaRequerida}` : "Sin fecha requerida",
      nivel: dias >= 3 ? "atencion" : "info",
      href: "/alertas?tab=solicitudes",
      mio: true,
    };
  });
}

// Bienestar: actividades que ya pasaron y siguen sin ejecutar, y ejecutadas que nadie cerró. Solo de las líneas que la
// persona puede editar.
const SIN_CERRAR_DIAS = 15;
async function lineasEditables(user) {
  const out = [];
  if (await isRoleAllowed(user.role, "editBienestar")) out.push("Bienestar");
  if (await isRoleAllowed(user.role, "editFundacion")) out.push("Fundación");
  return out;
}
const diasDesde = (fecha) => Math.floor((Date.parse(hoyColombia()) - Date.parse(fecha)) / 86400000);
const fichaDe = (a) => `${a.linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar"}/actividades/${a.id}`;
async function actividadesVencidas(user) {
  const hoy = hoyColombia();
  const rows = await prisma.actividadBienestar.findMany({ where: { linea: { in: await lineasEditables(user) }, estado: { in: ["creada", "programada"] }, fecha: { lt: hoy } }, orderBy: { fecha: "asc" } });
  return rows.filter((a) => (a.fechaFin || a.fecha) < hoy).map((a) => {
    const dias = diasDesde(a.fechaFin || a.fecha);
    return { id: `act-${a.id}`, ref: a.linea, titulo: a.nombre, contexto: `${a.linea} · ${a.fecha}`, dias, detalle: "Sigue programada: márcala como ejecutada o cámbiale la fecha", nivel: dias > 7 ? "critico" : "atencion", href: fichaDe(a), mio: false };
  });
}
async function actividadesSinCerrar(user) {
  const rows = await prisma.actividadBienestar.findMany({ where: { linea: { in: await lineasEditables(user) }, estado: "ejecutada" }, orderBy: { fecha: "asc" } });
  return rows.filter((a) => a.fecha && diasDesde(a.fechaFin || a.fecha) > SIN_CERRAR_DIAS).map((a) => ({
    id: `cerrar-${a.id}`, ref: a.linea, titulo: a.nombre, contexto: `${a.linea} · ${a.fecha}`, dias: diasDesde(a.fechaFin || a.fecha),
    detalle: "Ejecutada sin cerrar: califícala y ciérrala", nivel: "info", href: fichaDe(a), mio: false,
  }));
}

const SECCIONES = [
  { clave: "solicitudesCompra", titulo: "Solicitudes de compra de Bienestar", descripcion: "Bienestar las pidió para una actividad: genera la compra con los datos ya llenos o recházala indicando por qué.", roles: ["admin", "registro"], fuente: "solicitudes", permiso: "createRecord" },
  { clave: "informesPorEnviar", titulo: "Informes listos para que los envíes", descripcion: "Se generaron a su hora con el PDF listo: descárgalo y envíalo desde Outlook con el correo ya escrito.", roles: ["admin", "registro", "legalizar", "radicar", "proveedores"], fuente: "informes", permiso: "viewReportes" },
  // Bienestar ("*": cualquier rol, incluidos los creados en Usuarios › Roles, que pueda editar alguna línea)
  { clave: "bienVencidas", titulo: "Actividades que ya pasaron y siguen programadas", descripcion: "Su fecha ya pasó: márcalas como ejecutadas y carga la asistencia, o cámbiales la fecha si se movieron.", roles: ["*"], fuente: "bienestar", permisosAlguno: ["editBienestar", "editFundacion"] },
  { clave: "bienSinCerrar", titulo: "Actividades ejecutadas sin cerrar", descripcion: `Se ejecutaron hace más de ${SIN_CERRAR_DIAS} días y no se han cerrado con su calificación.`, roles: ["*"], fuente: "bienestar", permisosAlguno: ["editBienestar", "editFundacion"] },
  // Compras
  { clave: "atrasadas", titulo: "Solicitudes atrasadas", descripcion: "Compras sin fecha de entrega. Pasados 8 días hábiles incumplen el plazo; desde 5 ya conviene moverlas.", roles: ["admin", "registro"], fuente: "records" },
  { clave: "porLegalizar", titulo: "Compras por legalizar", descripcion: "Ya fueron entregadas o ejecutadas pero su legalización no se ha hecho. Los días cuentan desde la entrega.", roles: ["admin", "legalizar"], fuente: "records" },
  { clave: "rechazadas", titulo: "Legalizaciones rechazadas", descripcion: "Fueron rechazadas: hay que corregir lo que falta y presentarlas de nuevo.", roles: ["admin", "legalizar", "registro"], fuente: "records" },
  { clave: "porRadicar", titulo: "Compras legalizadas por radicar", descripcion: "Ya están legalizadas; el último paso del trámite es radicarlas (al radicar, Nova las valora). Los días cuentan desde la fecha de solicitud.", roles: ["admin", "radicar"], fuente: "records" },
  { clave: "radicadasSinValorar", titulo: "Radicadas sin valoración de Nova", descripcion: "Se radicaron pero no tienen la valoración de Nova (por ejemplo, si falló al radicar).", roles: ["admin", "radicar"], fuente: "records" },
  { clave: "valoracionBaja", titulo: "Compras mal valoradas por Nova", descripcion: `Compra o proveedor con ${VALORACION_BAJA}★ o menos en los últimos ${VALORACION_VENTANA_DIAS} días.`, roles: ["admin"], fuente: "records" },
  { clave: "fueraDePlazo", titulo: "Entregadas fuera de plazo", descripcion: `Se entregaron después de 8 días hábiles, en los últimos ${FUERA_DE_PLAZO_VENTANA_DIAS} días.`, roles: ["admin"], fuente: "records" },
  { clave: "presupuesto", titulo: "Áreas cerca del límite de presupuesto", descripcion: "Áreas con 80% o más de su presupuesto del año gastado (90% o más = excedido).", roles: ["admin"], fuente: "presupuesto", permiso: "viewPresupuesto" },
  // Proveedores
  { clave: "provDesactualizados", titulo: "Proveedores desactualizados", descripcion: "Deben actualizarse este ciclo y aún no han empezado. Los críticos, o todos si el corte está cerca, van primero.", roles: ["admin", "proveedores"], fuente: "proveedores", permiso: "viewProveedores" },
  { clave: "provEstancados", titulo: "Actualizaciones estancadas", descripcion: `En proceso o en aprobación sin cambios hace más de ${ESTANCADO_DIAS} días.`, roles: ["admin", "proveedores"], fuente: "proveedores", permiso: "viewProveedores" },
  { clave: "provChecklist", titulo: "Checklist incompleto", descripcion: "Ya iniciaron su actualización pero les faltan requisitos del checklist.", roles: ["admin", "proveedores"], fuente: "proveedores", permiso: "viewProveedores" },
  { clave: "provPorRegistrar", titulo: "Proveedores con NIT provisional", descripcion: "Existen por compras antiguas pero nunca se registraron formalmente.", roles: ["admin", "proveedores"], fuente: "proveedores", permiso: "viewProveedores" },
];

const peorNivel = (items) => items.reduce((n, it) => (NIVEL_ORDEN[it.nivel] < NIVEL_ORDEN[n] ? it.nivel : n), "info");

// Carga solo las fuentes que se van a usar y devuelve un constructor por sección.
async function prepararConstructores(user, usa) {
  const records = usa("records") || usa("presupuesto") ? await listRecords() : [];
  let prov = null;
  let ctxProv = { diasParaCorte: null, diasAviso: 30, anio: null };
  if (usa("proveedores")) {
    prov = await listMaestroProveedores({});
    const cfg = await getConfigProveedores();
    ctxProv = { diasParaCorte: prov.diasParaCorte, diasAviso: cfg.diasAviso, anio: prov.anio };
  }
  const constructores = {
    atrasadas: () => atrasadas(records, user),
    porLegalizar: () => porLegalizar(records, user),
    rechazadas: () => rechazadas(records, user),
    porRadicar: () => porRadicar(records, user),
    radicadasSinValorar: () => radicadasSinValorar(records, user),
    valoracionBaja: () => valoracionBaja(records, user),
    fueraDePlazo: () => fueraDePlazo(records, user),
    presupuesto: () => presupuesto(records),
    provDesactualizados: () => provDesactualizados(prov.rows, ctxProv),
    provEstancados: () => provEstancados(prov.rows, ctxProv.anio),
    provChecklist: () => provChecklist(prov.rows),
    provPorRegistrar: () => provPorRegistrar(prov.rows),
    informesPorEnviar: () => informesPorEnviar(user),
    solicitudesCompra: () => solicitudesCompraPendientes(),
    bienVencidas: () => actividadesVencidas(user),
    bienSinCerrar: () => actividadesSinCerrar(user),
  };
  return { constructores, ctxProv };
}

// Ítems de UNA sección, con la misma lógica que Mi día (lo usan las notificaciones, ver lib/notificacionesConsultas.js).
// No filtra por rol: quien llama ya validó que la persona puede ver esa fuente.
export async function itemsDeSeccion(clave, user) {
  const s = SECCIONES.find((x) => x.clave === clave);
  if (!s) throw new Error(`Sección desconocida: ${clave}`);
  const { constructores } = await prepararConstructores(user, (fuente) => fuente === s.fuente);
  return constructores[clave]();
}

// Todo lo que le toca hoy a este usuario. user: { id, role, nombre }.
export async function getPendientes(user) {
  const rol = user.role;
  const quiere = [];
  for (const s of SECCIONES) {
    if (!s.roles.includes(rol) && !s.roles.includes("*")) continue;
    if (s.permiso && !(await isRoleAllowed(rol, s.permiso))) continue;
    if (s.permisosAlguno) {
      let alguno = false;
      for (const f of s.permisosAlguno) if (await isRoleAllowed(rol, f)) { alguno = true; break; }
      if (!alguno) continue;
    }
    quiere.push(s);
  }
  const usa = (fuente) => quiere.some((s) => s.fuente === fuente);
  const { constructores, ctxProv } = await prepararConstructores(user, usa);

  const secciones = [];
  for (const s of quiere) {
    const items = await constructores[s.clave]();
    secciones.push({
      clave: s.clave,
      titulo: s.titulo,
      descripcion: s.descripcion,
      dominio: s.fuente === "proveedores" ? "proveedores" : s.fuente === "presupuesto" ? "presupuesto" : s.fuente === "informes" ? "informes" : s.fuente === "bienestar" ? "bienestar" : "compras",
      total: items.length,
      criticos: items.filter((i) => i.nivel === "critico").length,
      nivel: items.length ? peorNivel(items) : "ok",
      items,
    });
  }
  // Primero lo más urgente; dentro de cada nivel, lo que tiene más ítems.
  secciones.sort((a, b) => (NIVEL_ORDEN[a.nivel] ?? 3) - (NIVEL_ORDEN[b.nivel] ?? 3) || b.total - a.total);

  const todos = secciones.flatMap((s) => s.items);
  return {
    rol,
    fecha: hoyISO(),
    generadoAt: new Date().toISOString(),
    totales: { total: todos.length, criticos: todos.filter((i) => i.nivel === "critico").length, atencion: todos.filter((i) => i.nivel === "atencion").length },
    contexto: usa("proveedores") ? { diasParaCorte: ctxProv.diasParaCorte, anioCiclo: ctxProv.anio } : null,
    secciones,
  };
}

// Para Nova: lo mismo, recortado (los primeros ítems de cada sección).
export async function getPendientesParaNova(user, maxItems = 8) {
  const d = await getPendientes(user);
  return {
    fecha: d.fecha,
    totales: d.totales,
    contexto: d.contexto,
    secciones: d.secciones.map((s) => ({
      seccion: s.titulo,
      nivel: s.nivel,
      total: s.total,
      criticos: s.criticos,
      primeros: s.items.slice(0, maxItems).map((i) => ({ ref: i.ref, que: i.titulo, contexto: i.contexto, dias: i.dias, detalle: i.detalle, nivel: i.nivel, soloMio: i.mio })),
    })),
  };
}
