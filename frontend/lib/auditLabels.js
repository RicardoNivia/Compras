// Etiquetas compartidas entre el servidor (lib/audit.js) y componentes
// cliente (AuditoriaView) — sin dependencias de Prisma para poder importarse
// en el bundle del navegador.

export const FIELD_LABELS = {
  informe: "Informe",
  fechaSolicitud: "Fecha solicitud",
  fechaEntrega: "Fecha entrega",
  area: "Área",
  areaId: "Área (id)",
  responsable: "Responsable",
  responsableUserId: "Usuario responsable (id)",
  estado: "Estado",
  estadoId: "Estado (id)",
  categoria: "Categoría",
  categoriaId: "Categoría (id)",
  descripcion: "Descripción",
  medioPago: "Medio de pago",
  medioPagoId: "Medio de pago (id)",
  licitacion: "Licitación",
  estadoLegalizacion: "Estado legalización",
  estadoLegalizacionId: "Estado legalización (id)",
  nit: "Nit",
  proveedor: "Proveedor",
  proveedorNit: "Proveedor (NIT)",
  fe: "FE",
  valorConIva: "Valor con IVA",
  valorSinIva: "Valor sin IVA",
  valorCot: "Valor cotizado",
  moneda: "Moneda",
  valorUsd: "Valor en USD",
  trm: "TRM utilizada",
  observaciones: "Observaciones",
  radicado: "Radicado",
  actividad: "Actividad de Bienestar",
  actividadId: "Actividad de Bienestar (id)",
};

export const TOKEN_FIELD_LABELS = {
  nombre: "Nombre",
  prefijo: "Token (inicio)",
  expiraAt: "Vence",
  estado: "Estado",
};

export const MAESTRO_FIELD_LABELS = {
  tipo: "Tipo",
  valor: "Valor",
  aplicaEstrellas: "Aplica a estrellas",
  activo: "Activo",
};

export const VALORACION_FIELD_LABELS = {
  puntajeCompra: "Puntaje de la compra (Nova)",
  puntajeProveedor: "Puntaje del proveedor (Nova)",
  resumen: "Resumen de la valoración",
  observacionCompra: "Observación sobre la compra",
  observacionProveedor: "Observación sobre el proveedor",
  comprasPrevias: "Compras previas analizadas",
  origen: "Origen de la valoración",
};

export const CALIFICACION_FIELD_LABELS = {
  estrellas: "Estrellas",
  causasIds: "Causas",
  comentario: "Comentario",
};

export const PROVEEDOR_FIELD_LABELS = {
  nit: "Nit",
  nombre: "Nombre",
  descripcion: "Descripción",
  telefono: "Teléfono de contacto",
  correo: "Correo de contacto",
  internacional: "Proveedor internacional",
  ultimaEvaluacionCriticoFecha: "Fecha evaluación anual (crítico)",
  ultimaEvaluacionCriticoResultado: "Resultado evaluación anual (crítico)",
  activo: "Activo",
  inactivoMotivo: "Motivo de inactivo",
  criticidad: "Tipo (criticidad)",
  area: "Área",
  servicio: "Tipo de servicio",
  fechaActualizacion: "Fecha de última actualización",
  creadoPorNombre: "Registrado por",
  datosBorrados: "Datos propios borrados con el proveedor",
  esExcepcion: "Excepción",
  motivoExcepcion: "Motivo de excepción",
  justificacionExcepcion: "Justificación de excepción",
  radicaFacturas: "Radicación de facturas",
  clasificacionMonto: "Clasificación por monto",
  revision: "Revisión",
  observacion: "Observación",
};

export const CICLO_PROVEEDOR_FIELD_LABELS = {
  clasificacion: "Clasificación",
  estado: "Estado en el ciclo",
  fechaActualizacion: "Fecha de actualización",
  rutVigente: "RUT vigente",
  certBancaria: "Certificación bancaria",
  listasRestr: "Consulta en listas restrictivas",
  criticidadDefinida: "Criticidad definida",
  areaAsignada: "Área y tipo de servicio",
  contactoRegistrado: "Contacto registrado",
  checklist: "Checklist (requisitos cumplidos)",
};

export const CONFIG_PROVEEDORES_FIELD_LABELS = {
  diaCorte: "Día de corte",
  mesCorte: "Mes de corte",
  diasAviso: "Días de aviso antes del corte",
};

export const PROVEEDOR_PROCESO_FIELD_LABELS = {
  estado: "Estado",
  observacion: "Observación",
  criticidad: "Criticidad",
  area: "Área",
  servicio: "Tipo de servicio",
  contacto: "Contacto",
  viaExcepcionCorreo: "Vinculación por excepción de correo",
  radicado: "Radicación de facturas",
};

export const PROVEEDOR_CHECKLIST_FIELD_LABELS = {
  rutVigente: "RUT vigente",
  certBancaria: "Certificación bancaria",
  listasRestr: "Consulta en listas restrictivas",
};

export const USER_FIELD_LABELS = {
  nombre: "Nombre",
  email: "Correo",
  role: "Rol",
  activo: "Activo",
};

export const REPORT_FIELD_LABELS = {
  nombre: "Nombre",
  tipo: "Tipo de informe",
  prompt: "Instrucción (prompt)",
  bloques: "Bloques del informe",
  destinatarios: "Destinatarios (Para)",
  cc: "Copia (CC)",
  frecuencia: "Frecuencia",
  diaSemana: "Día de la semana",
  diaMes: "Día del mes",
  hora: "Hora de envío",
  prioridad: "Prioridad",
  sabadoHabil: "Sábado hábil",
  domingoHabil: "Domingo hábil",
  cuerpoModo: "Modo del cuerpo del correo",
  cuerpoPrompt: "Instrucción de estilo del cuerpo",
  cuerpoHtml: "Cuerpo del correo",
  periodoGeneral: "Periodo de los datos",
  activo: "Activo",
  esBorrador: "Borrador",
  pedido: "Pedido a Nova",
  reglaTexto: "Programación (texto)",
  ordinal: "Semana del mes",
  fechaUnica: "Fecha de envío único",
  saltarFestivos: "Saltar festivos",
  condicion: "Condición de envío",
  entrega: "Forma de entrega",
  responsables: "Responsables del envío",
  asunto: "Asunto del correo",
  mensaje: "Mensaje del correo",
  proposito: "Propósito del informe",
  accesoNombres: "Personas con acceso",
};

export const ACTION_LABELS = {
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
  radicar: "Radicó",
  enviar: "Envió",
  generar: "Generó",
  descargar: "Descargó",
  bloqueoIa: "Bloqueó respuesta IA",
};

export const ENTITY_LABELS = {
  record: "Registro de compra",
  maestro: "Maestro",
  proveedor: "Proveedor",
  user: "Usuario",
  presupuesto: "Presupuesto",
  permiso: "Permiso",
  informe: "Informe automático",
  informeEdicion: "Edición de informe",
  "agente-ia": "Agente IA",
  calificacion: "Calificación de proveedor",
  valoracion: "Valoración Nova de compra",
  cicloProveedor: "Ciclo de proveedor",
  configProveedores: "Configuración de proveedores",
};

// Conexión con Claude (MCP, solo admin): acciones y entidades que quedan en la auditoría.
Object.assign(ACTION_LABELS, { revocar: "Revocó", consultar: "Consultó" });
Object.assign(ENTITY_LABELS, { tokenAcceso: "Token de acceso a Claude", mcp: "Consulta desde Claude (MCP)" });

// Notificaciones configurables (ver docs/notificaciones-diseno.md). Los destinatarios se registran como lista de nombres.
export const NOTIFICACION_FIELD_LABELS = {
  nombre: "Nombre",
  pedido: "Lo que se pidió",
  fuenteLabel: "Fuente de datos",
  consultaLabel: "Qué consulta",
  parametrosTexto: "Filtros",
  alcance: "Alcance",
  condicion: "Condición de envío",
  umbral: "Umbral",
  programacion: "Programación",
  siFestivo: "Si cae en festivo",
  titulo: "Título",
  plantilla: "Mensaje",
  canalesTexto: "Canales",
  destinatariosTexto: "Destinatarios",
  estado: "Estado",
  motivoPausa: "Motivo de la pausa",
  propietarioNombre: "Propietario",
};

Object.assign(ACTION_LABELS, { pausar: "Pausó", reanudar: "Reanudó", probar: "Probó", baja: "Dejó de recibir", alta: "Volvió a recibir" });
Object.assign(ENTITY_LABELS, { notificacion: "Notificación" });

// Módulo de Bienestar (ver lib/actividadesBienestar.js): actividades del cronograma.
export const ACTIVIDAD_FIELD_LABELS = {
  nombre: "Nombre",
  fecha: "Fecha",
  fechaFin: "Fecha de fin",
  linea: "Línea",
  estado: "Estado",
  descripcion: "Descripción",
  responsableNombre: "Responsable",
  presupuesto: "Presupuesto asignado",
  inscritos: "Inscritos",
  asistentes: "Asistentes",
  enCronograma: "En el cronograma",
  aplicaParticipantes: "Aplica participantes y listas de asistencia",
  observaciones: "Observaciones",
  calificacion: "Calificación al cerrar",
  comentarioCierre: "Comentario de cierre",
  cerradaPorNombre: "Cerrada por",
};

Object.assign(ENTITY_LABELS, { actividad: "Actividad de Bienestar" });

// Roles personalizados (Usuarios › Roles, ver lib/rolesPersonalizados.js). Cada cambio de funcionalidad queda además como "permiso".
export const ROL_FIELD_LABELS = {
  nombre: "Nombre",
  descripcion: "Descripción",
  funcionalidadesTexto: "Funcionalidades",
};

Object.assign(ENTITY_LABELS, { rol: "Rol" });

// Participantes, inventario y formulario público de las actividades de Bienestar (ver lib/participantesBienestar.js,
// lib/inventarioBienestar.js). Se registran como una línea legible por acción ("Marcó 12 como asistieron"…).
export const DETALLE_FIELD_LABELS = { detalle: "Detalle" };
Object.assign(ACTION_LABELS, { importar: "Importó", clasificar: "Clasificó", rechazar: "Rechazó" });
Object.assign(ENTITY_LABELS, { participante: "Participantes de actividad", inventario: "Inventario de actividad", formularioActividad: "Formulario de inscripción", fotoActividad: "Fotos de actividad", observacionActividad: "Observaciones de actividad", sentimientoComentario: "Sentimiento de comentarios (Nova)", agenteImportacion: "Agente de importación", analisisBienestar: "Análisis de Bienestar (Nova)", analisisActividad: "Análisis de actividad (Nova)", solicitudCompra: "Solicitud de compra", agenteEvaluacion: "Agente de evaluación de actividades" });

export const SOLICITUD_COMPRA_FIELD_LABELS = {
  actividad: "Actividad",
  descripcion: "Qué se necesita",
  valorEstimado: "Valor estimado",
  categoria: "Categoría",
  proveedorSugerido: "Proveedor sugerido",
  fechaRequerida: "Para cuándo",
  observaciones: "Observaciones",
};
