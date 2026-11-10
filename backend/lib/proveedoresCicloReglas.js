// Reglas puras del ciclo anual de actualización de proveedores. Sin Prisma ni
// imports de Next para poder probarlas con Node (ver scripts/testProveedoresCiclo.mjs).
//
// Ciclo N = del 1 de abril N al 31 de marzo N+1 (corte configurable en
// ConfigProveedores). El cambio de ciclo ocurre solo: al día siguiente del corte
// todos los proveedores de Actualización quedan Desactualizados (ver
// lib/proveedoresCiclo.js#asegurarCicloVigente).
//
// Todas las fechas de corte se calculan en hora de Colombia (UTC-5, sin
// horario de verano), igual que lib/businessDays.js.

export const ESTADOS_CICLO = ["desactualizado", "en_proceso", "en_aprobacion", "actualizado"];

export const ESTADO_CICLO_LABELS = {
  desactualizado: "Desactualizado",
  en_proceso: "En proceso",
  en_aprobacion: "En aprobación",
  actualizado: "Actualizado",
};

// Tipo (criticidad), clasificación por monto y tipo de servicio son maestros
// (Maestros › tipoProveedor / clasificacionMonto / tipoServicio). La criticidad
// se reconoce por el texto del maestro sin tildes ni mayúsculas, así un
// "Crítico" / "CRITICO" / "Critico" cuenta igual.
export const REVISIONES = ["SRM", "Financiero"];

// Normaliza un NIT (llave primaria). Reglas (mismas que scripts/proveedores/mapeoProveedores.json):
//   · "PENDIENTE-…" (proveedor sin registro formal) se conserva tal cual.
//   · NIT colombiano con dígito de verificación ("900.123.456-7") → sin el DV ("900123456").
//   · Resto (incluye NIT/tax id extranjeros: RFC, CIF, EIN…) → mayúsculas, solo letras y dígitos.
export function normalizeNit(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (/^PEND/.test(s)) return s;
  const conDv = s.match(/^(\d{1,3}(?:[.\s]?\d{3}){1,3})\s*-\s*\d$/);
  if (conDv) return conDv[1].replace(/[^0-9]/g, "");
  return s.replace(/[^A-Z0-9]/g, "");
}

export function nitValido(nit) {
  return /^[A-Z0-9]{5,20}$/.test(nit) && /\d/.test(nit);
}


function sinTildes(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function esCritico(criticidad) {
  const t = sinTildes(criticidad);
  return /critic/.test(t) && !/no ?critic/.test(t);
}

// "critico" | "no_critico" | "sin_definir" — para conteos e indicadores.
export function claveCriticidad(criticidad) {
  if (!criticidad) return "sin_definir";
  return esCritico(criticidad) ? "critico" : "no_critico";
}

export const CLASIFICACIONES = ["actualizacion", "nuevo", "excepcion", "inactivo", "por_registrar", "no_aplica"];

export const CLASIFICACION_LABELS = {
  actualizacion: "Actualización",
  nuevo: "Nuevo",
  excepcion: "Excepción",
  inactivo: "Inactivo",
  por_registrar: "Por registrar",
  no_aplica: "No aplica",
};

// Los 6 requisitos del checklist. Los 3 "auto" se derivan del proveedor; los
// otros 3 se guardan por ciclo en ProveedorCicloDocumento.
export const CHECKLIST_ITEMS = [
  { clave: "criticidadDefinida", label: "Criticidad definida", auto: true },
  { clave: "areaAsignada", label: "Área y tipo de servicio", auto: true },
  { clave: "contactoRegistrado", label: "Contacto registrado", auto: true },
  { clave: "rutVigente", label: "RUT vigente", auto: false },
  { clave: "certBancaria", label: "Certificación bancaria", auto: false },
  { clave: "listasRestr", label: "Consulta en listas restrictivas", auto: false },
];

// Los 6 requisitos se pueden marcar a mano. Los 3 "auto" se autocompletan solos cuando el dato
// existe, pero una marca explícita (sí o no) gana sobre el valor automático, igual que en la
// página original de Gestión de Proveedores.
export const CLAVES_CHECKLIST = CHECKLIST_ITEMS.map((i) => i.clave);

const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

export const CONFIG_PROVEEDORES_DEFAULT = { diaCorte: 31, mesCorte: 3, diasAviso: 30 };

function partesBogota(date) {
  const d = new Date(new Date(date).getTime() + BOGOTA_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// Instante (UTC ms) del último segundo del día de corte del año indicado.
export function finCorte(anio, cfg = CONFIG_PROVEEDORES_DEFAULT) {
  return Date.UTC(anio, cfg.mesCorte - 1, cfg.diaCorte, 23, 59, 59, 999) - BOGOTA_OFFSET_MS;
}

// Año en que inicia el ciclo vigente en el instante `now`.
export function anioCicloVigente(now = new Date(), cfg = CONFIG_PROVEEDORES_DEFAULT) {
  const y = partesBogota(now).y;
  return new Date(now).getTime() > finCorte(y, cfg) ? y : y - 1;
}

export function inicioCiclo(anio, cfg = CONFIG_PROVEEDORES_DEFAULT) {
  return new Date(finCorte(anio, cfg) + 1);
}

export function finCicloFecha(anio, cfg = CONFIG_PROVEEDORES_DEFAULT) {
  return new Date(finCorte(anio + 1, cfg));
}

export function diasParaCorte(now = new Date(), cfg = CONFIG_PROVEEDORES_DEFAULT) {
  const anio = anioCicloVigente(now, cfg);
  return Math.ceil((finCorte(anio + 1, cfg) - new Date(now).getTime()) / (24 * 60 * 60 * 1000));
}

export function validarConfig(cfg) {
  const dia = Number(cfg.diaCorte);
  const mes = Number(cfg.mesCorte);
  const aviso = Number(cfg.diasAviso);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return "El mes de corte debe estar entre 1 y 12.";
  // Se valida contra un año bisiesto para aceptar el 29 de febrero.
  const diasMes = new Date(Date.UTC(2024, mes, 0)).getUTCDate();
  if (!Number.isInteger(dia) || dia < 1 || dia > diasMes) return "El día de corte no existe en ese mes.";
  if (!Number.isInteger(aviso) || aviso < 0 || aviso > 365) return "Los días de aviso deben estar entre 0 y 365.";
  return null;
}

// Un NIT provisional (PEND…/PENDIENTE-…) significa que el proveedor existe en el catálogo por
// compras históricas pero aún no fue registrado formalmente: no participa en el ciclo.
export function tieneNitProvisional(p) {
  return /^PEND/i.test(String(p.nit || ""));
}

// Clasificación de un proveedor dentro del ciclo `anio` (del día siguiente al corte del año `anio`
// hasta el corte del año siguiente: el ciclo 2026 va del 1 abr 2026 al 31 mar 2027).
//   · Excepción / Inactivo / Por registrar: no participan en el ciclo, sin importar ninguna fecha.
//   · Nuevo: dado de alta DENTRO del periodo del ciclo (solo es la etiqueta; el estado sale de la
//     fecha de última actualización, ver estadoInicial).
//   · Actualización: ya existía cuando empezó el ciclo.
//   · No aplica: dado de alta después de que terminó el ciclo (solo se ve al mirar ciclos pasados).
export function clasificacionEn(p, anio, cfg = CONFIG_PROVEEDORES_DEFAULT) {
  if (!p.activo) return "inactivo";
  if (p.esExcepcion) return "excepcion";
  if (tieneNitProvisional(p)) return "por_registrar";
  const alta = new Date(p.createdAt).getTime();
  if (alta > finCorte(anio + 1, cfg)) return "no_aplica";
  if (alta > finCorte(anio, cfg)) return "nuevo";
  return "actualizacion";
}

// ¿La última actualización del proveedor cae dentro del periodo del ciclo `anio`?
// El ciclo se calcula SIEMPRE con fechaActualizacion (fecha de la última
// actualización), nunca con la fecha de registro (createdAt).
export function actualizadoEnCiclo(p, anio, cfg = CONFIG_PROVEEDORES_DEFAULT) {
  if (!p.fechaActualizacion) return false;
  const t = new Date(p.fechaActualizacion).getTime();
  return t > finCorte(anio, cfg) && t <= finCorte(anio + 1, cfg);
}

// Estado con el que un proveedor entra al ciclo: Actualizado si su última
// actualización cae dentro del ciclo; si no, Desactualizado.
export function estadoInicial(p, anio, cfg = CONFIG_PROVEEDORES_DEFAULT) {
  return actualizadoEnCiclo(p, anio, cfg) ? "actualizado" : "desactualizado";
}

// docs: solo las marcas explícitas guardadas para el ciclo ({ clave: true|false }).
export function checklistDe(p, docs = {}) {
  const auto = {
    criticidadDefinida: !!(p.tipoProveedorId || p.criticidad),
    areaAsignada: !!(p.areaId || p.area) && !!(p.tipoServicioId || p.servicio),
    contactoRegistrado: !!p.telefono,
  };
  const items = CHECKLIST_ITEMS.map((i) => {
    const explicito = Object.prototype.hasOwnProperty.call(docs, i.clave);
    const derivado = i.auto ? !!auto[i.clave] : false;
    const cumple = explicito ? !!docs[i.clave] : derivado;
    return { clave: i.clave, label: i.label, auto: i.auto, cumple, marcado: explicito, derivado };
  });
  const completos = items.filter((i) => i.cumple).length;
  return {
    items,
    completos,
    total: items.length,
    faltan: items.filter((i) => !i.cumple).map((i) => i.label),
  };
}

// Alerta que ve Compras al elegir un proveedor. Solo avisa: nunca bloquea el registro.
export function alertaCompras(p, ciclo, checklist) {
  if (!p.activo) {
    return { nivel: "inactivo", titulo: "Proveedor inactivo", detalle: p.inactivoMotivo ? `Motivo: ${p.inactivoMotivo}.` : "No se puede usar en compras nuevas." };
  }
  if (p.esExcepcion) {
    return { nivel: "excepcion", titulo: "Excepción", detalle: p.motivoExcepcion ? `Motivo: ${p.motivoExcepcion}. No requiere actualización ni checklist.` : "No requiere actualización ni checklist." };
  }
  if (tieneNitProvisional(p)) {
    return { nivel: "aviso", titulo: "Proveedor sin NIT", detalle: "Tiene un NIT provisional: falta registrarlo formalmente (NIT y documentos). Puedes registrar la compra; el equipo de Proveedores verá el aviso." };
  }
  if (!ciclo) {
    return { nivel: "aviso", titulo: "Sin ciclo de actualización", detalle: "El proveedor aún no tiene estado en el ciclo vigente." };
  }
  const anio = ciclo.anio;
  if (ciclo.estado === "en_proceso" || ciclo.estado === "en_aprobacion") {
    const etiqueta = ESTADO_CICLO_LABELS[ciclo.estado];
    return { nivel: "tramite", titulo: `En trámite · ${etiqueta}`, detalle: `Ciclo ${anio}. Puedes registrar la compra; Proveedores está gestionando la actualización.` };
  }
  if (ciclo.estado === "actualizado" && checklist.completos === checklist.total) {
    return { nivel: "ok", titulo: "Información actualizada", detalle: `Ciclo ${anio} con checklist completo.` };
  }
  if (ciclo.estado === "actualizado") {
    return { nivel: "aviso", titulo: "Checklist incompleto", detalle: `Faltan: ${checklist.faltan.join(", ")}. Puedes registrar la compra; el equipo de Proveedores verá el aviso.` };
  }
  const motivo = ciclo.clasificacion === "nuevo" && checklist.completos < checklist.total
    ? `Nuevo ${anio}. Faltan: ${checklist.faltan.join(", ")}.`
    : `Desactualizado en el ciclo ${anio}.`;
  return { nivel: "aviso", titulo: "Proveedor desactualizado", detalle: `${motivo} Puedes registrar la compra; el equipo de Proveedores verá el aviso.` };
}

// Transiciones del tablero. Cualquier estado puede volver a "desactualizado"
// (devolver), y "actualizado" exige el checklist completo.
export function puedeCambiarEstado(desde, hacia, checklistCompleto) {
  if (!ESTADOS_CICLO.includes(hacia)) return { ok: false, motivo: "Estado inválido." };
  if (desde === hacia) return { ok: false, motivo: "El proveedor ya está en ese estado." };
  if (hacia === "actualizado" && !checklistCompleto) {
    return { ok: false, motivo: "Para marcar Actualizado, el checklist debe estar completo (6/6)." };
  }
  return { ok: true };
}
