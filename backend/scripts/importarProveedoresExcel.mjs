// Importación del Excel "Informe Proveedores Sincosoft" al modelo de ciclo anual.
//
// Uso:
//   node scripts/importarProveedoresExcel.mjs "ruta/al/archivo.xlsx" --dry-run   (solo muestra el resumen, no escribe)
//   node scripts/importarProveedoresExcel.mjs "ruta/al/archivo.xlsx"             (escribe en la BD, idempotente)
//
// Hojas que se leen: "Control actualización", "Control proveedores nuevos" y
// "Control Excepciones". "Informe" es un resumen precalculado y NUNCA se lee.
// "Contraseñas Adpro" NUNCA se lee: son credenciales en texto plano.
//
// Reglas de clasificación (ciclo = año en que inicia; 2026 = 1 abr 2026 → 31 mar 2027):
//   · Excepciones → Proveedor.esExcepcion (motivo desde Clasificación/Observación).
//   · Actualización "Aprobado" con Fecha ≥ 1 abr 2026 → ciclo 2026 Actualizado (checklist manual marcado).
//   · Actualización "Aprobado" sin fecha del ciclo, o cualquier otro estado → Desactualizado / En proceso / En aprobación.
//   · Desvinculado / No apto → Proveedor.activo = false (inactivoMotivo = estado original).
//   · Nuevos → ciclo 2026 como "nuevo" (createdAt = fecha de la hoja).
// Un NIT en varias hojas: Excepción gana sobre Actualización; los conflictos se listan en el resumen.

import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const CICLO_ANIO = 2026;
const INICIO_CICLO = new Date(Date.UTC(2026, 3, 1, 5, 0, 0)); // 1 abr 2026 00:00 Bogotá
const MOTIVOS = ["Gran contribuyente", "Proveedor internacional", "Compra ocasional", "Actividad económica", "Por clasificar"];

const HOJAS = {
  "control actualizacion": "actualizacion",
  "control proveedores nuevos": "nuevo",
  "control excepciones": "excepcion",
};

function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function textoLimpio(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || s === "-" ? null : s;
}

function soloDigitos(v) {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

// Fechas: objeto Date de la hoja, o texto dd/mm/yyyy hh:mm.
function fechaDe(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 5));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 5));
  return null;
}

function leerHoja(ws) {
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const h = filas.findIndex((r) => r.some((c) => norm(c) === "razon social"));
  if (h < 0) return [];
  const headers = filas[h].map((c) => norm(c));
  const idx = (pred) => headers.findIndex((x) => x && pred(x));
  const col = {
    fechaInv: idx((x) => x.startsWith("fecha invitacion")),
    revision: idx((x) => x.startsWith("revision")),
    razon: idx((x) => x === "razon social"),
    nit: idx((x) => x === "nit"),
    fecha: idx((x) => x === "fecha"),
    estado: idx((x) => x === "estado"),
    contacto: idx((x) => x === "contacto"),
    obs: idx((x) => x.startsWith("observacion")),
    tipo: idx((x) => x === "tipo"),
    clasif: idx((x) => x.startsWith("clasificacion")),
    area: idx((x) => x === "area"),
    servicio: idx((x) => x.startsWith("tipo servicio") || x.startsWith("tipo de servicio")),
  };
  const out = [];
  for (const r of filas.slice(h + 1)) {
    const razon = textoLimpio(r[col.razon]);
    if (!razon || /^total/i.test(razon)) continue;
    out.push({
      razon,
      nit: soloDigitos(r[col.nit]),
      fechaInv: col.fechaInv >= 0 ? r[col.fechaInv] : null,
      revision: col.revision >= 0 ? textoLimpio(r[col.revision]) : null,
      fecha: col.fecha >= 0 ? r[col.fecha] : null,
      estado: textoLimpio(r[col.estado]),
      contacto: textoLimpio(r[col.contacto]),
      obs: textoLimpio(r[col.obs]),
      tipo: textoLimpio(r[col.tipo]),
      clasif: textoLimpio(r[col.clasif]),
      area: textoLimpio(r[col.area]),
      servicio: textoLimpio(r[col.servicio]),
    });
  }
  return out;
}

// Normaliza a las opciones de los selectores de la ficha (ver lib/proveedoresCicloReglas.js).
function clasifMontoDe(v) {
  const t = norm(v);
  if (t.includes("bajo impacto")) return "Adquisición de Bajo Impacto";
  if (t.includes("alto costo")) return "Operación de Alto Costo";
  if (t.includes("grandes contribuyentes")) return "Grandes Contribuyentes o excepciones";
  if (t.includes("internacional")) return "Proveedor Internacional";
  return null;
}

function revisionDe(v) {
  const t = norm(v);
  if (t === "srm") return "SRM";
  if (t === "financiero") return "Financiero";
  return null;
}

function criticidadDe(tipo) {
  const t = norm(tipo);
  if (/no ?critic/.test(t)) return "No crítico";
  if (/critic/.test(t)) return "Critico";
  return null;
}

// Textos que aparecen en la columna Área de proveedores inactivos o anulados: no son áreas.
const AREAS_BASURA = new Set(["anulado", "desvinculado", "descarte", "-"]);

// Une variantes de escritura ("ADMINISTRATIVO", "Administrativo/ Mercadeo") en un solo nombre.
function canonicalArea(valor, variantes) {
  if (!valor) return null;
  const clave = norm(valor).replace(/\s*\/\s*/g, "/");
  if (AREAS_BASURA.has(clave)) return null;
  if (!variantes.has(clave)) variantes.set(clave, valor.replace(/\s*\/\s*/g, "/").trim());
  return variantes.get(clave);
}

function motivoExcepcionDe(row) {
  const c = norm(row.clasif);
  const o = norm(row.obs);
  if (c.includes("grandes contribuyentes")) return "Gran contribuyente";
  if (c.includes("proveedor internacional")) return "Proveedor internacional";
  if (o.includes("compren")) return "Compra ocasional";
  return "Por clasificar";
}

function estadoCicloDe(estadoTexto, fecha) {
  const e = norm(estadoTexto);
  if (e === "en aprobacion") return "en_aprobacion";
  if (/en proceso|pendiente|revision|solicit/.test(e)) return "en_proceso";
  if (e === "aprobado" || e === "ok") {
    return fecha && fecha >= INICIO_CICLO ? "actualizado" : "desactualizado";
  }
  return "desactualizado";
}

export function construirPlan(rutaArchivo) {
  const wb = XLSX.readFile(rutaArchivo, { cellDates: true });
  const porNit = new Map();
  const resumenHojas = {};

  for (const nombre of wb.SheetNames) {
    const proceso = HOJAS[norm(nombre)];
    if (!proceso) continue;
    const filas = leerHoja(wb.Sheets[nombre]);
    resumenHojas[nombre] = filas.length;
    for (const f of filas) {
      if (!f.nit) continue;
      const entrada = porNit.get(f.nit) || { nit: f.nit, filas: [] };
      entrada.filas.push({ ...f, proceso });
      porNit.set(f.nit, entrada);
    }
  }

  const plan = {
    hojas: resumenHojas,
    proveedores: [],
    sinNit: 0,
    conflictos: [],
    conteos: { excepcion: 0, actualizado: 0, desactualizado: 0, en_proceso: 0, en_aprobacion: 0, inactivo: 0, sinCiclo: 0, nuevosDentroDeLosAnteriores: 0 },
    motivos: {},
    areas: new Set(),
    areaVariantes: new Map(),
  };

  for (const { nit, filas } of porNit.values()) {
    const esExcepcion = filas.some((f) => f.proceso === "excepcion");
    const enAct = filas.filter((f) => f.proceso === "actualizacion");
    const enNue = filas.filter((f) => f.proceso === "nuevo");
    const base = filas[0];
    const ref = [...filas].reverse().find((f) => f.area || f.tipo) || base;
    const inactivo = [...enAct, ...enNue].find((f) => /desvincul|no apto|anulad/.test(norm(f.estado)));
    if (new Set(filas.map((f) => norm(f.estado))).size > 1 && filas.length > 1) plan.conflictos.push(nit);

    const p = {
      nit,
      nombre: base.razon,
      telefono: (base.contacto && /\d{7,}/.test(base.contacto)) ? base.contacto : null,
      criticidad: criticidadDe(ref.tipo),
      area: canonicalArea(ref.area, plan.areaVariantes),
      servicio: ref.servicio,
      activo: !inactivo,
      inactivoMotivo: inactivo ? `Importado: ${inactivo.estado}` : null,
      esExcepcion: esExcepcion && !inactivo,
      clasificacionMonto: clasifMontoDe(ref.clasif),
      revision: revisionDe(filas.map((x) => x.revision).find(Boolean)),
      observacion: ([...enAct, ...enNue].map((x) => x.obs).find((o) => o && !/^(anulado|desvinculado)$/i.test(o))) || null,
      fechaInvitacion: enAct.map((x) => fechaDe(x.fechaInv)).find(Boolean) || null,
      fechaActualizacion: enAct.map((x) => fechaDe(x.fecha)).find(Boolean) || null,
      fechaExcepcion: filas.filter((x) => x.proceso === "excepcion").map((x) => fechaDe(x.fecha)).find(Boolean) || null,
      motivoExcepcion: null,
      createdAt: null,
      ciclo: null,
    };
    if (p.area) plan.areas.add(p.area);

    // Fecha de alta. En la hoja de Nuevos la columna Fecha es la fecha de alta real. En Actualización
    // y Excepciones, "Fecha invitación" es la fecha en que se invitó a ACTUALIZARSE a un proveedor que
    // ya existía, no la de creación: si cae en el año del ciclo no puede convertirlo en "Nuevo".
    const antesDelCiclo = new Date(Date.UTC(CICLO_ANIO, 0, 1, 5));
    const altaNuevo = enNue.map((f) => fechaDe(f.fecha)).find(Boolean);
    const altaOtra = filas.map((f) => fechaDe(f.fechaInv)).find((d) => d && d < antesDelCiclo);
    p.createdAt = altaNuevo || (enNue.length ? INICIO_CICLO : null) || altaOtra || new Date(Date.UTC(CICLO_ANIO - 1, 11, 31, 5));

    if (p.esExcepcion) {
      p.motivoExcepcion = motivoExcepcionDe(filas.find((f) => f.proceso === "excepcion") || base);
      plan.motivos[p.motivoExcepcion] = (plan.motivos[p.motivoExcepcion] || 0) + 1;
      plan.conteos.excepcion++;
    } else if (!p.activo) {
      plan.conteos.inactivo++;
    } else if (enNue.length && p.createdAt.getUTCFullYear() === CICLO_ANIO) {
      const f = enNue[0];
      // Un nuevo entra actualizado solo si ya está aprobado; si no, queda en el estado real de la hoja.
      const estado = /aprobad/.test(norm(f.estado)) ? "actualizado" : estadoCicloDe(f.estado, null);
      p.ciclo = { clasificacion: "nuevo", estado, manuales: estado === "actualizado", aprobadoAt: estado === "actualizado" ? (fechaDe(f.fecha) || p.createdAt) : null };
      plan.conteos[estado]++;
      plan.conteos.nuevosDentroDeLosAnteriores++;
    } else if (enAct.length) {
      const f = enAct[0];
      const estado = estadoCicloDe(f.estado, fechaDe(f.fecha));
      p.ciclo = { clasificacion: "actualizacion", estado, manuales: estado === "actualizado", aprobadoAt: estado === "actualizado" ? fechaDe(f.fecha) : null };
      plan.conteos[estado]++;
    } else {
      plan.conteos.sinCiclo++;
    }

    plan.proveedores.push(p);
  }

  plan.areas = [...plan.areas].sort();
  return plan;
}

function imprimirResumen(plan) {
  console.log("Hojas leídas:", plan.hojas);
  console.log("Proveedores únicos (NIT):", plan.proveedores.length);
  console.log("NIT en más de una hoja con estados distintos:", plan.conflictos.length);
  console.log("Conteos por clasificación en el ciclo", CICLO_ANIO + ":");
  console.log(plan.conteos);
  console.log("Motivos de excepción:", plan.motivos);
  console.log("Áreas distintas:", plan.areas.length, plan.areas.join(" | "));
}

async function aplicar(plan) {
  const prisma = new PrismaClient();
  try {
    // Maestros: áreas y motivos de excepción (idempotente por tipo+valor).
    const areaIds = new Map();
    for (const valor of plan.areas) {
      const m = await prisma.maestro.upsert({
        where: { tipo_valor: { tipo: "area", valor } },
        update: {},
        create: { tipo: "area", valor },
      });
      areaIds.set(valor, m.id);
    }
    const motivoIds = new Map();
    for (const valor of MOTIVOS) {
      const m = await prisma.maestro.upsert({
        where: { tipo_valor: { tipo: "motivoExcepcion", valor } },
        update: {},
        create: { tipo: "motivoExcepcion", valor },
      });
      motivoIds.set(valor, m.id);
    }

    for (const p of plan.proveedores) {
      const data = {
        nombre: p.nombre,
        descripcion: p.servicio || "Proveedor importado desde el Excel de Proveedores 2026",
        telefono: p.telefono,
        criticidad: p.criticidad,
        areaId: p.area ? areaIds.get(p.area) : null,
        area: p.area,
        servicio: p.servicio,
        activo: p.activo,
        inactivoMotivo: p.inactivoMotivo,
        esExcepcion: p.esExcepcion,
        motivoExcepcionId: p.motivoExcepcion ? motivoIds.get(p.motivoExcepcion) : null,
        motivoExcepcion: p.motivoExcepcion,
        fechaActualizacion: p.fechaActualizacion,
        fechaExcepcion: p.fechaExcepcion,
        clasificacionMonto: p.clasificacionMonto,
        revision: p.revision,
        observacion: p.observacion,
        fechaInvitacion: p.fechaInvitacion,
      };
      const row = await prisma.proveedor.upsert({
        where: { nit: p.nit },
        // La fecha de alta real sale del Excel: sin esto, un proveedor ya cargado antes
        // conserva la fecha en que se migró a la BD y todos quedarían como "Nuevo".
        update: { ...data, createdAt: p.createdAt },
        create: { nit: p.nit, createdAt: p.createdAt, ...data },
      });
      if (p.ciclo) {
        const ciclo = await prisma.proveedorCiclo.upsert({
          where: { proveedorId_anio: { proveedorId: row.id, anio: CICLO_ANIO } },
          update: { clasificacion: p.ciclo.clasificacion, estado: p.ciclo.estado, aprobadoAt: p.ciclo.aprobadoAt },
          create: { proveedorId: row.id, anio: CICLO_ANIO, clasificacion: p.ciclo.clasificacion, estado: p.ciclo.estado, aprobadoAt: p.ciclo.aprobadoAt },
        });
        // Como en la página original, un proveedor Aprobado cumple los 6 requisitos del checklist.
        // Si no está aprobado no se marca nada: los 3 automáticos se derivan de sus datos y los
        // 3 manuales quedan pendientes.
        if (p.ciclo.manuales) {
          for (const clave of ["criticidadDefinida", "areaAsignada", "contactoRegistrado", "rutVigente", "certBancaria", "listasRestr"]) {
            await prisma.proveedorCicloDocumento.upsert({
              where: { cicloId_clave: { cicloId: ciclo.id, clave } },
              update: { cumple: true },
              create: { cicloId: ciclo.id, clave, cumple: true, verificadoPorNombre: "Importación Excel", verificadoAt: new Date() },
            });
          }
        }
      }
    }

    // Quita estados de ciclo que no corresponden (excepciones, inactivos y NIT provisionales no participan).
    const limpiados = await prisma.proveedorCiclo.deleteMany({
      where: { anio: CICLO_ANIO, proveedor: { OR: [{ nit: { startsWith: "PEND" } }, { esExcepcion: true }, { activo: false }] } },
    });
    console.log(`Estados de ciclo retirados a excepciones/inactivos/NIT provisional: ${limpiados.count}`);

    const iniciados = plan.proveedores.filter((p) => p.ciclo && p.ciclo.estado === "desactualizado").length;
    await prisma.cicloProveedorIniciado.upsert({
      where: { anio: CICLO_ANIO },
      update: { cantidad: iniciados },
      create: { anio: CICLO_ANIO, cantidad: iniciados },
    });
    await prisma.auditLog.create({ data: { action: "crear", entityType: "cicloProveedor", recordId: `carga-${Date.now()}`, recordInfo: `Carga de archivo Excel: ${plan.proveedores.length} proveedores`, userNombre: "Importación", changes: null } });
    console.log(`Importación aplicada: ${plan.proveedores.length} proveedores.`);
  } finally {
    await prisma.$disconnect();
  }
}

const esEjecucionDirecta = (process.argv[1] || "").replace(/\\/g, "/").endsWith("scripts/importarProveedoresExcel.mjs");
if (esEjecucionDirecta) {
  const ruta = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
  if (!ruta) {
    console.error("Uso: node scripts/importarProveedoresExcel.mjs \"ruta.xlsx\" [--dry-run]");
    process.exit(1);
  }
  const plan = construirPlan(ruta);
  imprimirResumen(plan);
  if (process.argv.includes("--dry-run")) {
    console.log("(dry-run: no se escribió nada)");
  } else {
    await aplicar(plan);
  }
}
