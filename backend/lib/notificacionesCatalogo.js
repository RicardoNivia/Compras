// Catálogo de las notificaciones configurables (ver docs/notificaciones-diseno.md). Puro: sin BD ni red.
// Lo usan la validación (lib/notificaciones.js), Nova (lib/notificacionesNova.js), las consultas y la UI.
// Copia exacta en frontend/lib/notificacionesCatalogo.js — al cambiar uno, cambia el otro (igual que lib/roles.js).

export const LIMITES = {
  maxPorPersona: 10, // notificaciones creadas por persona (activas, pausadas y borradores)
  maxDestinatarios: 6,
  maxItemsMensaje: 25,
  maxTurnosNova: 4,
};

// Cada notificación lee UNA fuente de datos; el permiso de la fuente decide quién puede crearla y recibirla.
export const FUENTES = {
  compras: { label: "Compras", descripcionPermiso: "Registros de compras" },
  mi_dia: { label: "Mi día", descripcionPermiso: "Mi día y alertas" },
  proveedores: { label: "Proveedores", descripcionPermiso: "Proveedores" },
  presupuesto: { label: "Presupuesto", descripcionPermiso: "Presupuesto" },
};

export const PERIODOS = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana_actual: "Esta semana",
  semana_anterior: "Semana anterior (lunes a domingo)",
  mes_actual: "Este mes",
  mes_anterior: "Mes anterior",
  ultimos_n_dias: "Últimos N días",
};

export const CAMPOS_FECHA = {
  fechaSolicitud: "Fecha de solicitud",
  fechaRegistro: "Fecha en que se creó en el sistema",
};

// Presets de listas de compras. "vencen_hoy": las compras no tienen fecha de vencimiento; se toma el plazo de
// 8 días hábiles desde la solicitud sin fecha de entrega (mismo SLA del Dashboard y de Mi día).
export const PRESETS_COMPRAS = {
  registradas: "Compras registradas en el período",
  vencen_hoy: "Cumplen hoy el plazo de 8 días hábiles sin entregarse",
  por_vencer: "Les quedan 1 o 2 días hábiles del plazo",
  atrasadas: "Ya pasaron el plazo de 8 días hábiles sin entregarse",
  por_legalizar: "Ejecutadas y sin legalizar",
  por_radicar: "Legalizadas y sin radicar",
  rechazadas: "Legalizaciones rechazadas",
  sin_valoracion: "Radicadas sin valoración de Nova",
};

export const PRESETS_PROVEEDORES = {
  desactualizados: "Proveedores desactualizados en el ciclo",
  estancados: "Actualizaciones estancadas (más de 15 días sin cambios)",
  checklist: "Checklist incompleto",
  por_registrar: "Proveedores con NIT provisional",
};

// tipo "conteo": un número con los más relevantes; "lista": ítems. alcances: si admite "general" y/o "personal".
export const CONSULTAS = {
  conteo_compras: {
    fuente: "compras",
    label: "Cuántas compras hubo en un período",
    tipo: "conteo",
    alcances: ["general", "personal"],
    usaPeriodo: true,
    usaCampoFecha: true,
    parametros: ["periodo", "dias", "campoFecha", "area", "categoria", "estado"],
    variables: ["total", "valor_total", "periodo", "fecha", "nombre"],
  },
  lista_compras: {
    fuente: "compras",
    label: "Lista de compras en una situación",
    tipo: "lista",
    alcances: ["general", "personal"],
    usaPeriodo: false, // solo el preset "registradas" usa período
    usaCampoFecha: false,
    parametros: ["preset", "periodo", "dias", "campoFecha", "area", "categoria", "estado"],
    variables: ["total", "valor_total", "periodo", "fecha", "nombre"],
  },
  valoraciones_compras: {
    fuente: "compras",
    label: "Valoraciones de Nova de las compras",
    tipo: "lista",
    alcances: ["general", "personal"],
    usaPeriodo: true,
    usaCampoFecha: false,
    parametros: ["periodo", "dias", "puntajeMax", "area"],
    variables: ["total", "periodo", "fecha", "nombre", "promedio"],
  },
  mis_pendientes: {
    fuente: "mi_dia",
    label: "Resumen de Mi día (lo que le toca a cada quien)",
    tipo: "lista",
    alcances: ["personal"],
    usaPeriodo: false,
    usaCampoFecha: false,
    parametros: [],
    variables: ["total", "urgentes", "fecha", "nombre"],
  },
  proveedores_ciclo: {
    fuente: "proveedores",
    label: "Proveedores en una situación del ciclo",
    tipo: "lista",
    alcances: ["general"],
    usaPeriodo: false,
    usaCampoFecha: false,
    parametros: ["preset"],
    variables: ["total", "fecha", "nombre"],
  },
  presupuesto_ejecucion: {
    fuente: "presupuesto",
    label: "Áreas que superan un % de su presupuesto",
    tipo: "lista",
    alcances: ["general"],
    usaPeriodo: false,
    usaCampoFecha: false,
    parametros: ["umbral", "area"],
    variables: ["total", "fecha", "nombre", "umbral"],
  },
};

// ---------- Fase 2: notificaciones por evento ----------
// Salen cuando el hecho ocurre (sin hora), salvo que se agrupen en un resumen diario. `filtros`: qué se puede filtrar.
export const EVENTOS = {
  "compra.creada": { fuente: "compras", label: "Se registra una compra", accion: "se registra una compra", filtros: ["area", "proveedor"] },
  "compra.legalizada": { fuente: "compras", label: "Se legaliza una compra", accion: "se legaliza una compra", filtros: ["area", "proveedor"] },
  "compra.rechazada": { fuente: "compras", label: "Se rechaza una legalización", accion: "se rechaza una legalización", filtros: ["area", "proveedor"] },
  "compra.radicada": { fuente: "compras", label: "Se radica una compra", accion: "se radica una compra", filtros: ["area", "proveedor"] },
  "compra.valorada": { fuente: "compras", label: "Nova valora una compra radicada", accion: "Nova valora una compra", filtros: ["area", "puntajeMax", "proveedor"] },
  "compra.calificada": { fuente: "compras", label: "Se califica al proveedor de una compra", accion: "se califica al proveedor de una compra", filtros: ["area", "estrellasMax", "proveedor"] },
  "compra.entregada": { fuente: "compras", label: "Se entrega una compra", accion: "se entrega una compra", filtros: ["area", "soloFueraDePlazo", "proveedor"] },
  "compra.anulada": { fuente: "compras", label: "Se anula una compra", accion: "se anula una compra", filtros: ["area", "proveedor"] },
  "compra.eliminada": { fuente: "compras", label: "Se elimina una compra", accion: "se elimina una compra", filtros: ["area", "proveedor"] },
  "compra.actualizada": { fuente: "compras", label: "Se actualiza cualquier campo de una compra", accion: "se actualiza una compra", filtros: ["area", "proveedor"] },
  "proveedor.creado": { fuente: "proveedores", label: "Se crea un proveedor", accion: "se crea un proveedor", filtros: [] },
  "proveedor.actualizado": { fuente: "proveedores", label: "Se actualiza cualquier dato de un proveedor", accion: "se actualiza un proveedor", filtros: ["proveedor"] },
  "proveedor.eliminado": { fuente: "proveedores", label: "Se elimina un proveedor", accion: "se elimina un proveedor", filtros: ["proveedor"] },
  "proveedor.ciclo_cambio": { fuente: "proveedores", label: "Cambia el estado del ciclo de un proveedor", accion: "cambia el estado del ciclo de un proveedor", filtros: ["estadoCiclo", "proveedor"] },
  "presupuesto.actualizado": { fuente: "presupuesto", label: "Se configura, modifica o elimina un presupuesto", accion: "se configura o modifica un presupuesto", filtros: ["area"] },
  "presupuesto.umbral": { fuente: "presupuesto", label: "Se supera el 80 % o el 100 % del presupuesto (general, por área o por categoría)", accion: "se supera el 80 % o el 100 % de un presupuesto", filtros: ["nivel", "area", "soloExcedido"] },
};

export const AGRUPACIONES = {
  inmediato: "Al instante, una por cada evento",
  cada_15_min: "Agrupadas cada 15 minutos",
  resumen_diario: "En un resumen diario",
};

// Nivel del presupuesto que se supera ("categoria" solo existe si el año está configurado por categoría).
export const NIVELES_PRESUPUESTO = { general: "Presupuesto general (todas las áreas)", area: "Presupuesto de un área", categoria: "Presupuesto de una categoría de un área" };

export const ESTADOS_CICLO = { desactualizado: "Desactualizado", en_proceso: "En proceso", en_aprobacion: "En aprobación", actualizado: "Actualizado" };

// Variables del mensaje de una notificación por evento (además de total, fecha y nombre).
export const VARIABLES_EVENTO = ["total", "evento", "numero", "descripcion", "proveedor", "area", "valor", "puntaje_compra", "puntaje_proveedor", "estrellas", "detalle", "fecha", "nombre"];

export const CONDICIONES = {
  si_hay_resultados: "Solo si hay resultados",
  siempre: "Siempre, aunque no haya resultados",
  umbral: "Solo si hay al menos N resultados",
};

export const SI_FESTIVO = {
  correr: "Enviarlo el siguiente día hábil",
  enviar: "Enviarlo igual ese día",
  omitir: "No enviarlo ese período",
};

export const CANALES = {
  app: "En la app",
  teams: "Teams",
  correo: "Correo",
};

export const ESTADOS = {
  borrador: "Borrador",
  activa: "Activa",
  pausada: "Pausada",
  pausada_por_permisos: "Pausada por permisos",
};

export const ORIGENES = {
  evento: "Por evento",
  programado: "Programada",
  recuperado: "Programada (con retraso)",
  manual: "Enviada manualmente",
  prueba: "Prueba",
};

export const RESULTADOS = {
  procesando: "Procesando",
  enviada: "Enviada",
  omitida_sin_resultados: "Sin resultados (no se envió)",
  parcial: "Enviada con errores",
  error: "Error",
};

export const VARIABLES = {
  total: "Cantidad de resultados",
  valor_total: "Valor total con IVA",
  periodo: "Período consultado",
  fecha: "Fecha del envío",
  nombre: "Nombre de quien la recibe",
  urgentes: "Pendientes urgentes",
  promedio: "Puntaje promedio",
  umbral: "Porcentaje configurado",
  evento: "Qué pasó",
  numero: "Número de la compra (#)",
  descripcion: "Descripción",
  proveedor: "Proveedor",
  area: "Área",
  valor: "Valor con IVA",
  puntaje_compra: "Puntaje de la compra (1 a 5)",
  puntaje_proveedor: "Puntaje del proveedor (1 a 5)",
  estrellas: "Estrellas de la calificación",
  detalle: "Detalle del evento",
};

// Preguntas que el servidor exige aunque Nova no las haga (ver docs, §5.2). Devuelve [{ id, texto, opciones }].
export function preguntasFaltantes(regla) {
  const faltan = [];
  if (regla?.disparador === "evento") return preguntasEvento(regla);
  const c = CONSULTAS[regla?.consulta];
  if (!c) return faltan;
  const p = regla.parametros || {};
  // Por evento (fase 2) sale cuando el evento ocurre: sin hora ni festivo, salvo si se agrupa en un resumen diario.
  const porEvento = regla.disparador === "evento";
  const pideHora = !porEvento || regla.agrupacion === "resumen_diario";
  if (pideHora && !regla.hora) {
    faltan.push({ id: "hora", texto: "¿A qué hora la envío?", opciones: [["07:00", "7:00 a. m."], ["08:00", "8:00 a. m."], ["09:00", "9:00 a. m."], ["14:00", "2:00 p. m."]].map(([valor, etiqueta]) => ({ valor, etiqueta })), permiteTexto: true });
  }
  if (!porEvento && ["semanal", "mensual", "mensual_semana", "unica"].includes(regla.frecuencia) && !regla.siFestivo) {
    faltan.push({ id: "siFestivo", texto: "Si ese día es festivo, ¿qué hago?", opciones: Object.entries(SI_FESTIVO).map(([valor, etiqueta]) => ({ valor, etiqueta })) });
  }
  if (!regla.condicion) {
    faltan.push({ id: "condicion", texto: "Si no hay resultados, ¿la envío igual?", opciones: [{ valor: "si_hay_resultados", etiqueta: "No, solo si hay resultados" }, { valor: "siempre", etiqueta: "Sí, enviarla igual" }] });
  }
  const necesitaCampoFecha = c.usaCampoFecha || (regla.consulta === "lista_compras" && p.preset === "registradas");
  if (necesitaCampoFecha && !p.campoFecha) {
    faltan.push({ id: "campoFecha", texto: "¿Cuento las compras por fecha de solicitud o por el día en que se crearon en el sistema?", opciones: Object.entries(CAMPOS_FECHA).map(([valor, etiqueta]) => ({ valor, etiqueta })) });
  }
  if (c.alcances.length > 1 && !regla.alcance) {
    faltan.push({ id: "alcance", texto: "¿Quieres lo de todos o solo lo de cada persona que la recibe (por ejemplo, solo sus compras)?", opciones: [{ valor: "general", etiqueta: "Lo de todos" }, { valor: "personal", etiqueta: "Solo lo de cada quien" }] });
  }
  return faltan;
}

// Por evento: sale cuando ocurre, así que NO se pregunta hora ni festivo; solo cómo agruparlas (y la hora si es un
// resumen diario) y, para compras, si son las de todos o solo las de cada quien.
function preguntasEvento(regla) {
  const faltan = [];
  const ev = EVENTOS[regla.evento];
  if (!ev) {
    faltan.push({ id: "evento", texto: "¿Cuándo te aviso?", opciones: Object.entries(EVENTOS).slice(0, 5).map(([valor, e]) => ({ valor, etiqueta: e.label })) });
    return faltan;
  }
  if (!regla.agrupacion) {
    faltan.push({ id: "agrupacion", texto: "¿Te aviso apenas pase cada una o prefieres agruparlas?", opciones: Object.entries(AGRUPACIONES).map(([valor, etiqueta]) => ({ valor, etiqueta })) });
  }
  if (regla.agrupacion === "resumen_diario" && !regla.hora) {
    faltan.push({ id: "hora", texto: "¿A qué hora te envío el resumen del día?", opciones: [["08:00", "8:00 a. m."], ["12:00", "12:00 p. m."], ["17:00", "5:00 p. m."], ["18:00", "6:00 p. m."]].map(([valor, etiqueta]) => ({ valor, etiqueta })), permiteTexto: true });
  }
  if (ev.fuente === "compras" && !regla.alcance) {
    faltan.push({ id: "alcance", texto: "¿De todas las compras o solo de las que tiene a cargo cada persona que la recibe?", opciones: [{ valor: "general", etiqueta: "De todas" }, { valor: "personal", etiqueta: "Solo las de cada quien" }] });
  }
  return faltan;
}
