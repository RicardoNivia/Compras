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
};

export const ACTION_LABELS = {
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
  radicar: "Radicó",
  enviar: "Envió",
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
  "agente-ia": "Agente IA",
  calificacion: "Calificación de proveedor",
  valoracion: "Valoración Nova de compra",
  cicloProveedor: "Ciclo de proveedor",
  configProveedores: "Configuración de proveedores",
};
