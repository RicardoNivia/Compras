// Migración del Excel "Informe Proveedores Sincosoft" al módulo de Proveedores (NIT = llave primaria).
//
// Uso (desde backend/):
//   node scripts/proveedores/migrarProveedoresExcel.mjs validar  "ruta.xlsx" [--reporte salida.json]
//       Valida estructura (hojas y columnas: Estado, Contacto, Observación, Tipo, Clasificación por monto,
//       Área, Tipo servicio) y normaliza los valores con mapeoProveedores.json. NO toca la base de datos.
//   node scripts/proveedores/migrarProveedoresExcel.mjs simular  "ruta.xlsx" [--reporte salida.json]
//       Igual que validar + compara con la BD (solo lectura): cuántos se insertan / actualizan, maestros nuevos.
//   node scripts/proveedores/migrarProveedoresExcel.mjs maestros "ruta.xlsx"
//       Solo crea los valores de maestro que falten (tipo, clasificación por monto, área de proveedor,
//       tipo de servicio, motivo de excepción). Idempotente.
//   node scripts/proveedores/migrarProveedoresExcel.mjs aplicar  "ruta.xlsx" --confirmar [--reporte salida.json]
//       Escribe: maestros + UPSERT de cada proveedor por NIT (si existe se actualiza, si no se inserta) +
//       estado del ciclo vigente. Idempotente: correrlo dos veces deja el mismo resultado.
//
// La base de datos es la de DATABASE_URL (backend/.env o variable de entorno).
// Después de aplicar, correr scripts/proveedores/verificarIntegridadProveedores.mjs.
//
// Reglas principales (ver mapeoProveedores.json para el detalle configurable):
//   · Llave: NIT normalizado (lib/proveedoresCicloReglas.js#normalizeNit). Un NIT en varias hojas se
//     consolida en un solo proveedor tomando la hoja de mayor prioridad (Excepción > Nuevo > Actualización).
//   · Un proveedor existente con NIT provisional (PENDIENTE-…) y la misma razón social recibe el NIT real
//     (se propaga a sus registros por FK) en lugar de crear un duplicado.
//   · Tipo, Clasificación por monto, Área y Tipo servicio se guardan por id de maestro (+ snapshot del texto).
//   · El ciclo se calcula con la fecha de ÚLTIMA ACTUALIZACIÓN; las excepciones no participan del ciclo.
//   · Una celda vacía en el Excel nunca borra un dato que ya exista en la BD.
//   · Un ciclo aprobado a mano en la app (aprobadoPorUserId) no se sobrescribe.
//   · La columna de Revisión (Andrea / Yuli) NO se migra.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import {
  normalizeNit, nitValido, anioCicloVigente, inicioCiclo, finCicloFecha, clasificacionEn, actualizadoEnCiclo,
  CONFIG_PROVEEDORES_DEFAULT, CLAVES_CHECKLIST,
} from "../../lib/proveedoresCicloReglas.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CFG = JSON.parse(fs.readFileSync(path.join(DIR, "mapeoProveedores.json"), "utf8"));
const ACTOR = "Importación Excel";

const ETIQUETAS_COLUMNA = {
  razonSocial: "Razón social", nit: "NIT", fechaInvitacion: "Fecha invitación", fecha: "Fecha",
  estado: "Estado", contacto: "Contacto", observacion: "Observación", tipo: "Tipo",
  clasificacionMonto: "Clasificación por monto", area: "Área", tipoServicio: "Tipo servicio",
};

// ---------- Normalización básica ----------

export function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const VACIOS = new Set(CFG.valoresVacios.map(norm));
const DE_BAJA = new Set(CFG.valoresDeBaja.map(norm));

function limpio(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return VACIOS.has(norm(s)) ? null : s;
}

function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Fecha en hora de Colombia (mediodía, para no caer en el borde de un corte de ciclo).
export function fechaDe(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 17));
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 17));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 17));
  return null;
}

function diccionario(grupos) {
  const map = new Map();
  for (const [canon, alias] of Object.entries(grupos)) {
    map.set(norm(canon), canon);
    for (const a of alias) map.set(norm(a), canon);
  }
  return map;
}

const ESTADOS = diccionario(CFG.estados);
const REVISIONES = diccionario(CFG.revision);

function mapRevision(v) {
  const s = limpio(v);
  return s ? REVISIONES.get(norm(s)) || null : null;
}

// ---------- Reporte ----------

function nuevoReporte() {
  return {
    estructura: { hojas: [], ignoradas: [], desconocidas: [], errores: [], advertencias: [] },
    filas: { leidas: 0, sinNit: [], nitInvalido: [] },
    equivalencias: {}, // tipo -> { "texto original": "valor normalizado" }
    sinMapeo: {}, // tipo -> { texto: veces }
    invalidos: {}, // tipo -> { texto: veces }
    nitEnVariasHojas: [],
    proveedores: 0,
    conteos: {},
    bd: null,
  };
}

function contar(obj, tipo, texto) {
  obj[tipo] = obj[tipo] || {};
  obj[tipo][texto] = (obj[tipo][texto] || 0) + 1;
}

// ---------- Maestros: mapeo de valores ----------

function crearMapeadores(rep) {
  const out = {};
  for (const [tipo, conf] of Object.entries(CFG.maestros)) {
    out[tipo] = { conf, alias: diccionario(conf.valores), invalidos: new Set((conf.invalidos || []).map(norm)), nuevos: new Map() };
  }

  function simple(tipo, s) {
    const M = out[tipo];
    const n = norm(s);
    if (M.alias.has(n)) return M.alias.get(n);
    if (!M.conf.crearNuevos) {
      contar(rep.sinMapeo, tipo, s);
      return null;
    }
    // Valor nuevo: se unifican mayúsculas/tildes; gana la escritura con más tildes (la más "correcta").
    const tildes = (x) => (x.normalize("NFD").match(/[̀-ͯ]/g) || []).length;
    const actual = M.nuevos.get(n);
    if (!actual || tildes(s) > tildes(actual)) M.nuevos.set(n, capital(s));
    return { pendiente: n };
  }

  // Devuelve { valor, baja } — "valor" puede ser provisional ({pendiente}) hasta resolver los nuevos.
  function mapear(tipo, raw) {
    const s = limpio(raw);
    if (!s) return { valor: null };
    const n = norm(s);
    if (DE_BAJA.has(n)) return { valor: null, baja: true };
    const M = out[tipo];
    if (M.invalidos.has(n)) {
      contar(rep.invalidos, tipo, s);
      return { valor: null };
    }
    const comp = M.conf.compuestos;
    if (comp && s.includes(comp.separador)) {
      const partes = s.split(comp.separador).map((p) => p.trim()).filter((p) => p && !VACIOS.has(norm(p)));
      if (partes.length > 1) return { valor: { compuesto: partes.map((p) => simple(tipo, p)).filter(Boolean) }, original: s };
    }
    return { valor: simple(tipo, s), original: s };
  }

  // Convierte los valores provisionales en el texto final (después de ver todo el Excel).
  function resolver(tipo, v) {
    const M = out[tipo];
    if (!v) return null;
    if (typeof v === "string") return v;
    if (v.pendiente) return M.nuevos.get(v.pendiente);
    if (v.compuesto) {
      const partes = v.compuesto.map((p) => resolver(tipo, p)).filter(Boolean);
      if (M.conf.compuestos.ordenar) partes.sort((a, b) => norm(a).localeCompare(norm(b)));
      return [...new Set(partes)].join(M.conf.compuestos.unir);
    }
    return null;
  }

  return { mapear, resolver };
}

// ---------- Lectura y validación de estructura ----------

export function leerPlantilla(ruta, rep = nuevoReporte()) {
  const est = rep.estructura;
  if (!fs.existsSync(ruta)) {
    est.errores.push(`No existe el archivo: ${ruta}`);
    return { hojas: [], rep };
  }
  const wb = XLSX.readFile(ruta, { cellDates: true });
  const hojas = [];

  for (const nombre of wb.SheetNames) {
    const n = norm(nombre);
    if (CFG.hojasIgnoradas.includes(n)) { est.ignoradas.push(nombre); continue; }
    const proceso = CFG.hojas[n];
    if (!proceso) { est.desconocidas.push(nombre); continue; }

    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: null, raw: true });
    const h = filas.findIndex((r) => r.some((c) => CFG.columnas.razonSocial.includes(norm(c))));
    if (h < 0) {
      est.errores.push(`Hoja "${nombre}": no se encontró la fila de encabezados (columna "Razón social").`);
      continue;
    }
    const enc = filas[h].map(norm);
    const columnas = {};
    for (const [canon, alias] of Object.entries(CFG.columnas)) {
      const i = enc.findIndex((x) => x && alias.includes(x));
      if (i >= 0) columnas[canon] = i;
    }
    const obligatoriasFaltantes = CFG.columnasObligatorias.filter((c) => columnas[c] === undefined);
    const faltantes = CFG.columnasRequeridas.filter((c) => columnas[c] === undefined);
    const info = {
      nombre, proceso, filaEncabezados: h + 1,
      encabezados: filas[h].filter((x) => x !== null && x !== ""),
      columnasEncontradas: Object.keys(columnas).map((c) => ETIQUETAS_COLUMNA[c]),
      columnasRequeridasFaltantes: faltantes.map((c) => ETIQUETAS_COLUMNA[c]),
      filas: 0,
    };
    est.hojas.push(info);
    if (obligatoriasFaltantes.length) {
      est.errores.push(`Hoja "${nombre}": faltan columnas obligatorias ${obligatoriasFaltantes.map((c) => ETIQUETAS_COLUMNA[c]).join(", ")}. La hoja no se migra.`);
      continue;
    }
    if (faltantes.length) {
      est.advertencias.push(`Hoja "${nombre}": no trae ${faltantes.map((c) => `"${ETIQUETAS_COLUMNA[c]}"`).join(", ")}; esos datos quedan sin valor desde esta hoja.`);
    }

    const get = (r, c) => (columnas[c] === undefined ? null : r[columnas[c]]);
    const datos = [];
    for (let k = h + 1; k < filas.length; k++) {
      const r = filas[k];
      const razon = limpio(get(r, "razonSocial"));
      if (!razon || /^total/i.test(razon)) continue;
      const fila = { hoja: nombre, proceso, fila: k + 1, razon };
      for (const c of Object.keys(CFG.columnas)) if (c !== "razonSocial") fila[c] = get(r, c);
      datos.push(fila);
    }
    info.filas = datos.length;

    // Columnas corridas: "Fecha" con la revisión (Financiero/SRM) en vez de una fecha.
    let fechaEsRevision = false;
    if (CFG.revisionEnColumnaFecha && columnas.fecha !== undefined) {
      const valores = datos.map((d) => d.fecha).filter((v) => limpio(v));
      const comoRevision = valores.filter((v) => !fechaDe(v) && mapRevision(v)).length;
      if (valores.length && comoRevision > valores.length / 2) {
        fechaEsRevision = true;
        est.advertencias.push(`Hoja "${nombre}": la columna "Fecha" contiene la revisión (${comoRevision} de ${valores.length} filas), no fechas; esa columna se ignora.`);
      }
    }
    hojas.push({ nombre, proceso, columnas, datos, fechaEsRevision });
  }

  for (const c of CFG.columnasRequeridas) {
    if (!hojas.some((h) => h.columnas[c] !== undefined)) est.errores.push(`Ninguna hoja trae la columna requerida "${ETIQUETAS_COLUMNA[c]}".`);
  }
  if (!hojas.length) est.errores.push("No se encontró ninguna hoja válida para migrar.");
  return { hojas, rep };
}

// ---------- Normalización de filas y consolidación por NIT ----------

function normalizarFila(f, hoja, mapeo, rep) {
  const nit = normalizeNit(f.nit);
  if (!nit) { rep.filas.sinNit.push(`${f.hoja} fila ${f.fila}: ${f.razon}`); return null; }
  if (!nitValido(nit) && !/^PEND/.test(nit)) { rep.filas.nitInvalido.push(`${f.hoja} fila ${f.fila}: "${f.nit}" (${f.razon})`); return null; }

  const estadoTxt = limpio(f.estado);
  const estado = estadoTxt ? ESTADOS.get(norm(estadoTxt)) || null : null;
  if (estadoTxt && !estado) contar(rep.sinMapeo, "estado", estadoTxt);

  const tipo = mapeo.mapear("tipoProveedor", f.tipo);
  const clasif = mapeo.mapear("clasificacionMonto", f.clasificacionMonto);
  const area = mapeo.mapear("areaProveedor", f.area);
  const servicio = mapeo.mapear("tipoServicio", f.tipoServicio);

  const contacto = limpio(f.contacto);
  const digitos = contacto ? contacto.replace(/\D/g, "") : "";
  const obs = limpio(f.observacion);

  return {
    hoja: f.hoja, fila: f.fila, proceso: hoja.proceso, nit, razon: f.razon.replace(/\s+/g, " ").trim(),
    estado, estadoTxt,
    baja: estado === "inactivo" || [tipo, clasif, area, servicio].some((x) => x.baja),
    tipo: tipo.valor, tipoOriginal: tipo.original,
    clasif: clasif.valor, clasifOriginal: clasif.original,
    area: area.valor, areaOriginal: area.original,
    servicio: servicio.valor, servicioOriginal: servicio.original,
    fecha: hoja.fechaEsRevision ? null : fechaDe(f.fecha),
    fechaInvitacion: fechaDe(f.fechaInvitacion),
    telefono: digitos.length >= 7 && !/@/.test(contacto) ? contacto : null,
    correo: contacto && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto) ? contacto : null,
    observacion: obs && !DE_BAJA.has(norm(obs)) ? obs : null,
  };
}

function motivoExcepcionDe(p) {
  for (const r of CFG.motivoExcepcion.reglas) {
    if (r.clasificacionMonto && p.clasificacionMonto === r.clasificacionMonto) return r.motivo;
    if (r.observacionContiene && norm(p.observacion).includes(norm(r.observacionContiene))) return r.motivo;
  }
  return CFG.motivoExcepcion.porDefecto;
}

// Construye el plan de migración (sin BD). anio/cfg: ciclo vigente.
export function construirPlan(ruta, { now = new Date(), cfgCiclo = CONFIG_PROVEEDORES_DEFAULT } = {}) {
  const rep = nuevoReporte();
  const { hojas } = leerPlantilla(ruta, rep);
  const mapeo = crearMapeadores(rep);
  const anio = anioCicloVigente(now, cfgCiclo);
  const inicio = inicioCiclo(anio, cfgCiclo);
  const prioridad = (proc) => CFG.prioridadProceso.indexOf(proc);

  const porNit = new Map();
  for (const hoja of hojas) {
    for (const f of hoja.datos) {
      rep.filas.leidas++;
      const n = normalizarFila(f, hoja, mapeo, rep);
      if (!n) continue;
      if (!porNit.has(n.nit)) porNit.set(n.nit, []);
      porNit.get(n.nit).push(n);
    }
  }

  const proveedores = [];
  for (const [nit, filasNit] of porNit) {
    const filas = [...filasNit].sort((a, b) => prioridad(a.proceso) - prioridad(b.proceso));
    const base = filas[0];
    if (filas.length > 1) rep.nitEnVariasHojas.push({ nit, hojas: filas.map((x) => `${x.hoja} (fila ${x.fila}, ${x.estadoTxt || "sin estado"})`), usa: base.hoja });
    const primero = (campo) => filas.map((x) => x[campo]).find((v) => v !== null && v !== undefined) ?? null;

    const p = {
      nit,
      nombre: base.razon,
      origen: base.hoja,
      proceso: base.proceso,
      estadoExcel: base.estadoTxt,
      activo: !base.baja,
      inactivoMotivo: base.baja ? `Importado: ${base.estadoTxt || "dado de baja en el Excel"}` : null,
      esExcepcion: base.proceso === "excepcion" && !base.baja,
      tipoProveedor: mapeo.resolver("tipoProveedor", primero("tipo")),
      clasificacionMonto: mapeo.resolver("clasificacionMonto", primero("clasif")),
      areaProveedor: mapeo.resolver("areaProveedor", primero("area")),
      tipoServicio: mapeo.resolver("tipoServicio", primero("servicio")),
      telefono: primero("telefono"),
      correo: primero("correo"),
      observacion: base.observacion ?? primero("observacion"),
      fechaInvitacion: filas.map((x) => x.fechaInvitacion).filter(Boolean).sort((a, b) => a - b)[0] || null,
    };

    // Equivalencias aplicadas (para el reporte de normalización).
    for (const [tipo, campo] of [["tipoProveedor", "tipoOriginal"], ["clasificacionMonto", "clasifOriginal"], ["areaProveedor", "areaOriginal"], ["tipoServicio", "servicioOriginal"]]) {
      for (const x of filas) {
        if (!x[campo]) continue;
        const valor = mapeo.resolver(tipo, x[campo === "tipoOriginal" ? "tipo" : campo === "clasifOriginal" ? "clasif" : campo === "areaOriginal" ? "area" : "servicio"]);
        if (valor && valor !== x[campo]) {
          rep.equivalencias[tipo] = rep.equivalencias[tipo] || {};
          rep.equivalencias[tipo][x[campo]] = valor;
        }
      }
    }

    p.motivoExcepcion = p.esExcepcion ? motivoExcepcionDe(p) : null;
    p.fechaExcepcion = p.esExcepcion ? (filas.find((x) => x.proceso === "excepcion")?.fecha || filas.find((x) => x.proceso === "excepcion")?.fechaInvitacion || null) : null;

    // Fecha de última actualización (base del ciclo): solo si el estado de la hoja principal es aprobado.
    if (!p.esExcepcion && base.estado === "aprobado") {
      const campos = CFG.fechaActualizacion[base.proceso] || [];
      p.fechaActualizacion = campos.map((c) => base[c]).find(Boolean) || null;
    } else {
      p.fechaActualizacion = null;
    }

    // Fecha de alta. En Nuevos es la fecha de la hoja; en Actualización/Excepciones el proveedor ya existía
    // cuando se le invitó a actualizarse: se usa la invitación más antigua, nunca dentro del ciclo vigente.
    const unDiaAntes = new Date(inicio.getTime() - 24 * 3600 * 1000);
    if (base.proceso === "nuevo") p.createdAt = base.fecha || base.fechaInvitacion || inicio;
    else p.createdAt = p.fechaInvitacion && p.fechaInvitacion < inicio ? p.fechaInvitacion : unDiaAntes;

    // Estado en el ciclo vigente (solo quienes participan).
    p.ciclo = null;
    const provisional = { activo: p.activo, esExcepcion: p.esExcepcion, nit, createdAt: p.createdAt, fechaActualizacion: p.fechaActualizacion };
    const clasificacion = clasificacionEn(provisional, anio, cfgCiclo);
    if (clasificacion === "actualizacion" || clasificacion === "nuevo") {
      let estado = "desactualizado";
      if (base.estado === "aprobado") estado = actualizadoEnCiclo(provisional, anio, cfgCiclo) ? "actualizado" : "desactualizado";
      else if (base.estado === "en_aprobacion") estado = "en_aprobacion";
      else if (base.estado === "en_proceso") estado = "en_proceso";
      p.ciclo = { anio, clasificacion, estado };
    }
    p.clasificacion = clasificacion;
    rep.conteos[clasificacion] = (rep.conteos[clasificacion] || 0) + 1;
    if (p.ciclo) rep.conteos[`ciclo_${p.ciclo.estado}`] = (rep.conteos[`ciclo_${p.ciclo.estado}`] || 0) + 1;
    proveedores.push(p);
  }

  rep.proveedores = proveedores.length;
  return { anio, inicio, fin: finCicloFecha(anio, cfgCiclo), proveedores, rep, ok: rep.estructura.errores.length === 0 };
}

// ---------- Comparación con la BD ----------

const TIPOS_MAESTRO_PROVEEDOR = ["tipoProveedor", "clasificacionMonto", "areaProveedor", "tipoServicio", "motivoExcepcion"];
const CAMPO_MAESTRO = {
  tipoProveedor: { valor: "tipoProveedor", id: "tipoProveedorId", texto: "criticidad" },
  clasificacionMonto: { valor: "clasificacionMonto", id: "clasificacionMontoId", texto: "clasificacionMonto" },
  areaProveedor: { valor: "areaProveedor", id: "areaId", texto: "area" },
  tipoServicio: { valor: "tipoServicio", id: "tipoServicioId", texto: "servicio" },
  motivoExcepcion: { valor: "motivoExcepcion", id: "motivoExcepcionId", texto: "motivoExcepcion" },
};

async function cargarBd(prisma, anio) {
  const [proveedores, maestros, ciclos] = await Promise.all([
    prisma.proveedor.findMany(),
    prisma.maestro.findMany({ where: { tipo: { in: TIPOS_MAESTRO_PROVEEDOR } } }),
    prisma.proveedorCiclo.findMany({ where: { anio } }),
  ]);
  return { proveedores, maestros, ciclos };
}

// Une el plan con la BD: acción por proveedor, maestros a crear y cambios campo a campo.
export function compararConBd(plan, bd) {
  const porNit = new Map(bd.proveedores.map((p) => [p.nit, p]));
  const pendPorNombre = new Map();
  for (const p of bd.proveedores) {
    if (!/^PEND/.test(p.nit)) continue;
    const k = norm(p.nombre);
    pendPorNombre.set(k, pendPorNombre.has(k) ? null : p); // nombre repetido = ambiguo, no se usa
  }
  const maestroPorNorm = new Map(bd.maestros.map((m) => [`${m.tipo}|${norm(m.valor)}`, m]));
  const maestrosACrear = new Map();
  const ciclosPorNit = new Map(bd.ciclos.map((c) => [c.proveedorNit, c]));

  const resolverMaestro = (tipo, valor) => {
    if (!valor) return null;
    const k = `${tipo}|${norm(valor)}`;
    const m = maestroPorNorm.get(k);
    if (m) return { id: m.id, valor: m.valor, existente: true, activo: m.activo };
    if (!maestrosACrear.has(k)) maestrosACrear.set(k, { tipo, valor });
    return { id: null, valor, existente: false };
  };

  const acciones = { crear: 0, actualizar: 0, sinCambios: 0, asignarNitAPendiente: 0 };
  for (const p of plan.proveedores) {
    let actual = porNit.get(p.nit) || null;
    p.nitPendienteAnterior = null;
    if (!actual) {
      const pend = pendPorNombre.get(norm(p.nombre));
      if (pend && !porNit.has(p.nit)) {
        actual = pend;
        p.nitPendienteAnterior = pend.nit;
      }
    }
    p.maestros = {};
    for (const tipo of TIPOS_MAESTRO_PROVEEDOR) p.maestros[tipo] = resolverMaestro(tipo, p[CAMPO_MAESTRO[tipo].valor]);
    p.actual = actual;
    p.cicloActual = actual ? ciclosPorNit.get(actual.nit) || null : null;
    p.cambios = diffProveedor(p, actual);
    p.accion = !actual ? "crear" : p.nitPendienteAnterior ? "asignarNitAPendiente" : p.cambios.length ? "actualizar" : "sinCambios";
    acciones[p.accion]++;
  }
  return { acciones, maestrosACrear: [...maestrosACrear.values()] };
}

// Datos a escribir: el Excel manda, pero una celda vacía no borra lo que ya existe.
function datosProveedor(p, actual) {
  const conservar = (nuevo, campo) => (nuevo !== null && nuevo !== undefined ? nuevo : actual ? actual[campo] : null);
  const d = {
    nombre: p.nombre,
    telefono: conservar(p.telefono, "telefono"),
    correo: conservar(p.correo, "correo"),
    observacion: conservar(p.observacion, "observacion"),
    fechaInvitacion: conservar(p.fechaInvitacion, "fechaInvitacion"),
    activo: p.activo,
    inactivoMotivo: p.activo ? null : p.inactivoMotivo,
    esExcepcion: p.esExcepcion,
  };
  for (const tipo of ["tipoProveedor", "clasificacionMonto", "areaProveedor", "tipoServicio"]) {
    const c = CAMPO_MAESTRO[tipo];
    const m = p.maestros[tipo];
    d[c.id] = m ? m.id : actual ? actual[c.id] : null;
    d[c.texto] = m ? m.valor : actual ? actual[c.texto] : null;
  }
  if (p.esExcepcion) {
    const m = p.maestros.motivoExcepcion;
    const mismoMotivo = actual?.esExcepcion && actual.motivoExcepcionId;
    d.motivoExcepcionId = mismoMotivo ? actual.motivoExcepcionId : m?.id || null;
    d.motivoExcepcion = mismoMotivo ? actual.motivoExcepcion : m?.valor || null;
    d.fechaExcepcion = actual?.fechaExcepcion || p.fechaExcepcion || new Date();
  } else {
    Object.assign(d, { motivoExcepcionId: null, motivoExcepcion: null, justificacionExcepcion: null, fechaExcepcion: null });
  }
  // Fecha de última actualización: nunca retrocede.
  const fa = p.fechaActualizacion;
  const fActual = actual?.fechaActualizacion || null;
  d.fechaActualizacion = p.esExcepcion ? fActual : fa && (!fActual || fa > fActual) ? fa : fActual;
  // Fecha de alta: la más antigua entre la BD y el Excel.
  d.createdAt = actual && actual.createdAt < p.createdAt ? actual.createdAt : p.createdAt;
  if (!actual || /Importado automáticamente|^Proveedor migrado/i.test(actual.descripcion || "")) {
    d.descripcion = p.tipoServicio || actual?.descripcion || CFG.descripcionPorDefecto;
  }
  return d;
}

const CAMPOS_DIFF = ["nombre", "telefono", "correo", "observacion", "activo", "inactivoMotivo", "esExcepcion", "motivoExcepcion", "criticidad", "clasificacionMonto", "area", "servicio", "fechaActualizacion", "createdAt", "descripcion"];

function valorComparable(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v ?? null;
}

function diffProveedor(p, actual) {
  const d = datosProveedor({ ...p, maestros: p.maestros }, actual);
  p.datos = d;
  if (!actual) return CAMPOS_DIFF.filter((c) => d[c] !== undefined && d[c] !== null).map((c) => ({ campo: c, antes: null, despues: valorComparable(d[c]) }));
  const cambios = [];
  for (const c of CAMPOS_DIFF) {
    if (d[c] === undefined) continue;
    const a = valorComparable(actual[c]);
    const b = valorComparable(d[c]);
    if (a !== b) cambios.push({ campo: c, antes: a, despues: b });
  }
  if (p.nitPendienteAnterior) cambios.unshift({ campo: "nit", antes: p.nitPendienteAnterior, despues: p.nit });
  return cambios;
}

// ---------- Escritura ----------

const ETIQUETAS_AUDIT = {
  nit: "Nit", nombre: "Nombre", telefono: "Teléfono de contacto", correo: "Correo de contacto",
  observacion: "Observación", activo: "Activo", inactivoMotivo: "Motivo de inactivo", esExcepcion: "Excepción",
  motivoExcepcion: "Motivo de excepción", criticidad: "Tipo (criticidad)", clasificacionMonto: "Clasificación por monto",
  area: "Área", servicio: "Tipo de servicio", fechaActualizacion: "Fecha de última actualización", createdAt: "Fecha de registro",
  descripcion: "Descripción",
};

export async function sincronizarMaestros(prisma, maestrosACrear) {
  let creados = 0;
  for (const m of maestrosACrear) {
    const existe = await prisma.maestro.findFirst({ where: { tipo: m.tipo, valor: { equals: m.valor, mode: "insensitive" } } });
    if (existe) continue;
    await prisma.maestro.upsert({ where: { tipo_valor: { tipo: m.tipo, valor: m.valor } }, update: {}, create: { tipo: m.tipo, valor: m.valor } });
    creados++;
  }
  return creados;
}

async function aplicar(prisma, plan, comparacion) {
  const creados = await sincronizarMaestros(prisma, comparacion.maestrosACrear);
  console.log(`Maestros creados: ${creados}`);
  // Re-resuelve los ids ahora que existen todos los maestros.
  const bd = await cargarBd(prisma, plan.anio);
  compararConBd(plan, bd);

  const auditorias = [];
  let escritos = 0;
  for (const p of plan.proveedores) {
    if (p.accion === "sinCambios" && (!p.ciclo || cicloIgual(p))) continue;
    await prisma.$transaction(async (tx) => {
      if (p.nitPendienteAnterior) {
        // El NIT provisional pasa a ser el real: registros y ciclos siguen por FK (ON UPDATE CASCADE).
        await tx.proveedor.update({ where: { nit: p.nitPendienteAnterior }, data: { nit: p.nit } });
        await tx.record.updateMany({ where: { proveedorNit: p.nit }, data: { nit: p.nit } });
        await tx.calificacionProveedor.updateMany({ where: { proveedorNit: p.nitPendienteAnterior }, data: { proveedorNit: p.nit } });
      }
      const data = p.datos;
      await tx.proveedor.upsert({
        where: { nit: p.nit },
        update: data,
        create: { nit: p.nit, ...data, descripcion: data.descripcion || CFG.descripcionPorDefecto, creadoPorNombre: ACTOR },
      });

      if (!p.ciclo) {
        // Excepciones, inactivos y NIT provisionales no participan en el ciclo vigente.
        await tx.proveedorCiclo.deleteMany({ where: { proveedorNit: p.nit, anio: plan.anio, aprobadoPorUserId: null } });
      } else if (!p.cicloActual?.aprobadoPorUserId) {
        const aprobadoAt = p.ciclo.estado === "actualizado" ? data.fechaActualizacion : null;
        const ciclo = await tx.proveedorCiclo.upsert({
          where: { proveedorNit_anio: { proveedorNit: p.nit, anio: plan.anio } },
          update: { clasificacion: p.ciclo.clasificacion, estado: p.ciclo.estado, aprobadoAt, aprobadoPorNombre: aprobadoAt ? ACTOR : null },
          create: { proveedorNit: p.nit, anio: plan.anio, clasificacion: p.ciclo.clasificacion, estado: p.ciclo.estado, aprobadoAt, aprobadoPorNombre: aprobadoAt ? ACTOR : null },
        });
        // Aprobado = cumple los 6 requisitos del checklist (igual que en la página original).
        if (p.ciclo.estado === "actualizado") {
          for (const clave of CLAVES_CHECKLIST) {
            await tx.proveedorCicloDocumento.upsert({
              where: { cicloId_clave: { cicloId: ciclo.id, clave } },
              update: {},
              create: { cicloId: ciclo.id, clave, cumple: true, verificadoPorNombre: ACTOR, verificadoAt: aprobadoAt || new Date() },
            });
          }
        }
      }
    });
    escritos++;
    if (p.cambios.length) {
      auditorias.push({
        action: p.accion === "crear" ? "crear" : "editar",
        entityType: "proveedor",
        recordId: p.nit,
        recordInfo: `${p.nombre} (NIT ${p.nit}) — ${ACTOR}`,
        userNombre: ACTOR,
        changes: JSON.stringify(p.cambios.map((c) => ({ field: c.campo, label: ETIQUETAS_AUDIT[c.campo] || c.campo, before: c.antes, after: c.despues }))),
      });
    }
  }

  for (let i = 0; i < auditorias.length; i += 200) await prisma.auditLog.createMany({ data: auditorias.slice(i, i + 200) });
  const desactualizados = plan.proveedores.filter((p) => p.ciclo?.estado === "desactualizado").length;
  await prisma.cicloProveedorIniciado.upsert({
    where: { anio: plan.anio },
    update: {},
    create: { anio: plan.anio, cantidad: desactualizados },
  });
  await prisma.auditLog.create({
    data: {
      action: "crear", entityType: "cicloProveedor", recordId: `carga-${Date.now()}`, userNombre: ACTOR,
      recordInfo: `Carga de archivo Excel: ${plan.proveedores.length} proveedores (${comparacion.acciones.crear} nuevos, ${comparacion.acciones.actualizar + comparacion.acciones.asignarNitAPendiente} actualizados)`,
    },
  });
  return { escritos, auditados: auditorias.length };
}

function cicloIgual(p) {
  const c = p.cicloActual;
  return !!c && c.estado === p.ciclo.estado && c.clasificacion === p.ciclo.clasificacion;
}

// ---------- Salida ----------

function imprimir(plan, comparacion) {
  const r = plan.rep;
  const e = r.estructura;
  console.log("\n=== Estructura de la plantilla ===");
  for (const h of e.hojas) {
    console.log(`· ${h.nombre} (${h.filas} filas): columnas requeridas faltantes: ${h.columnasRequeridasFaltantes.length ? h.columnasRequeridasFaltantes.join(", ") : "ninguna"}`);
  }
  if (e.ignoradas.length) console.log(`· Hojas ignoradas (no se leen): ${e.ignoradas.join(", ")}`);
  if (e.desconocidas.length) console.log(`· Hojas no configuradas (no se leen): ${e.desconocidas.join(", ")}`);
  e.advertencias.forEach((a) => console.log(`  ADVERTENCIA: ${a}`));
  e.errores.forEach((a) => console.log(`  ERROR: ${a}`));

  console.log("\n=== Normalización ===");
  console.log(`Filas leídas: ${r.filas.leidas} · proveedores únicos por NIT: ${r.proveedores}`);
  if (r.filas.sinNit.length) console.log(`Filas sin NIT (no se migran): ${r.filas.sinNit.length}`, r.filas.sinNit.slice(0, 10));
  if (r.filas.nitInvalido.length) console.log(`Filas con NIT inválido (no se migran): ${r.filas.nitInvalido.length}`, r.filas.nitInvalido.slice(0, 10));
  if (r.nitEnVariasHojas.length) console.log(`NIT en varias hojas (consolidados): ${r.nitEnVariasHojas.length}`, r.nitEnVariasHojas.map((x) => `${x.nit} → ${x.usa}`).join(" · "));
  for (const [tipo, eq] of Object.entries(r.equivalencias)) console.log(`Equivalencias ${tipo}: ${Object.entries(eq).map(([a, b]) => `"${a}"→"${b}"`).join(", ")}`);
  for (const [tipo, v] of Object.entries(r.sinMapeo)) console.log(`SIN MAPEO ${tipo} (quedan vacíos, agregar alias en mapeoProveedores.json): ${JSON.stringify(v)}`);
  for (const [tipo, v] of Object.entries(r.invalidos)) console.log(`Valores inválidos descartados ${tipo}: ${JSON.stringify(v)}`);
  console.log(`Clasificación en el ciclo ${plan.anio}:`, r.conteos);

  if (comparacion) {
    console.log("\n=== Contra la base de datos ===");
    console.log("Acciones:", comparacion.acciones);
    const porTipo = {};
    comparacion.maestrosACrear.forEach((m) => { (porTipo[m.tipo] = porTipo[m.tipo] || []).push(m.valor); });
    for (const [t, v] of Object.entries(porTipo)) console.log(`Maestros nuevos ${t} (${v.length}): ${v.join(" | ")}`);
    const pend = plan.proveedores.filter((p) => p.nitPendienteAnterior);
    if (pend.length) console.log("NIT provisional que recibe el NIT real:", pend.map((p) => `${p.nitPendienteAnterior} → ${p.nit} (${p.nombre})`).join(" · "));
  }
}

function reporteJson(plan, comparacion) {
  return {
    generado: new Date().toISOString(),
    cicloVigente: plan.anio,
    ...plan.rep,
    bd: comparacion ? { acciones: comparacion.acciones, maestrosACrear: comparacion.maestrosACrear } : null,
    detalle: plan.proveedores.map((p) => ({
      nit: p.nit, nombre: p.nombre, origen: p.origen, accion: p.accion || null, nitPendienteAnterior: p.nitPendienteAnterior || null,
      activo: p.activo, esExcepcion: p.esExcepcion, motivoExcepcion: p.motivoExcepcion, clasificacion: p.clasificacion,
      ciclo: p.ciclo, tipo: p.tipoProveedor, clasificacionMonto: p.clasificacionMonto, area: p.areaProveedor, tipoServicio: p.tipoServicio,
      fechaActualizacion: p.fechaActualizacion, cambios: p.cambios || null,
    })),
  };
}

// ---------- CLI ----------

const esDirecto = (process.argv[1] || "").replace(/\\/g, "/").endsWith("scripts/proveedores/migrarProveedoresExcel.mjs");
if (esDirecto) {
  const [comando, ruta] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const idxReporte = process.argv.indexOf("--reporte");
  const salida = idxReporte > 0 ? process.argv[idxReporte + 1] : null;
  if (!["validar", "simular", "maestros", "aplicar"].includes(comando) || !ruta) {
    console.error('Uso: node scripts/proveedores/migrarProveedoresExcel.mjs <validar|simular|maestros|aplicar> "ruta.xlsx" [--confirmar] [--reporte salida.json]');
    process.exit(1);
  }

  let prisma = null;
  let cfgCiclo = CONFIG_PROVEEDORES_DEFAULT;
  if (comando !== "validar") {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const row = await prisma.configProveedores.findFirst();
    if (row) cfgCiclo = { diaCorte: row.diaCorte, mesCorte: row.mesCorte, diasAviso: row.diasAviso };
  }
  try {
    const plan = construirPlan(ruta, { cfgCiclo });
    let comparacion = null;
    if (prisma) comparacion = compararConBd(plan, await cargarBd(prisma, plan.anio));
    imprimir(plan, comparacion);
    if (salida) {
      fs.writeFileSync(salida, JSON.stringify(reporteJson(plan, comparacion), null, 2));
      console.log(`\nReporte detallado: ${salida}`);
    }
    if (!plan.ok) {
      console.error("\nLa plantilla tiene errores de estructura: no se migra nada.");
      process.exitCode = 2;
    } else if (comando === "maestros") {
      console.log(`\nMaestros creados: ${await sincronizarMaestros(prisma, comparacion.maestrosACrear)}`);
    } else if (comando === "aplicar") {
      if (!process.argv.includes("--confirmar")) {
        console.error("\nPara escribir en la base de datos agrega --confirmar.");
        process.exitCode = 1;
      } else {
        const r = await aplicar(prisma, plan, comparacion);
        console.log(`\nMigración aplicada: ${r.escritos} proveedores escritos, ${r.auditados} cambios auditados.`);
      }
    } else {
      console.log(`\n(${comando}: no se escribió nada)`);
    }
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}
