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
  lider: "Líder del área",
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
Object.assign(ENTITY_LABELS, { participante: "Participantes de actividad", inventario: "Inventario de actividad", formularioActividad: "Formulario de inscripción", fotoActividad: "Fotos de actividad", observacionActividad: "Observaciones de actividad", sentimientoComentario: "Sentimiento de comentarios (Nova)", agenteImportacion: "Agente de importación", analisisBienestar: "Análisis de Bienestar (Nova)", analisisActividad: "Análisis de actividad (Nova)", solicitudCompra: "Solicitud de compra", agenteEvaluacion: "Agente de evaluación de actividades", propuestaAsociacion: "Agente asociador de compras", cuadroComparativo: "Cuadro comparativo (agente cotizador)", salarioMinimo: "Salario mínimo (SMMLV)", configAgente: "Encendido de agentes", verificacionFactura: "Verificación de factura (agente de Compras)" });
// Inventario (bodega) de Bienestar: artículos y sus movimientos (lib/inventarioBodega.js).
Object.assign(ENTITY_LABELS, { inventarioBodega: "Inventario de Bienestar (bodega)" });
export const INVENTARIO_BODEGA_FIELD_LABELS = { producto: "Artículo", bodega: "Bodega", referencia: "Referencia", unidad: "Unidad", minimo: "Mínimo", vence: "Vence", activo: "Activo", detalle: "Detalle" };

export const SOLICITUD_COMPRA_FIELD_LABELS = {
  actividad: "Actividad",
  descripcion: "Qué se necesita",
  valorEstimado: "Valor estimado",
  categoria: "Categoría",
  proveedorSugerido: "Proveedor sugerido",
  fechaRequerida: "Para cuándo",
  observaciones: "Observaciones",
};

// Correo vinculado (Microsoft 365) y agente de correo que detecta solicitudes de creación de proveedor.
Object.assign(ACTION_LABELS, { buscar: "Buscó" });
Object.assign(ACTION_LABELS, { vincular: "Vinculó", desvincular: "Desvinculó", aprobar: "Aprobó", descartar: "Descartó", detectar: "Detectó" });
Object.assign(ENTITY_LABELS, { cuentaCorreo: "Correo vinculado", solicitudProveedorCorreo: "Solicitud de proveedor por correo" });
export const CUENTA_CORREO_FIELD_LABELS = {
  email: "Buzón",
  estado: "Estado",
  agenteActivo: "Agente de correo encendido",
};
export const SOLICITUD_PROVEEDOR_CORREO_FIELD_LABELS = {
  estado: "Estado",
  remitente: "Remitente",
  asunto: "Asunto",
  nit: "NIT",
  nombre: "Razón social",
  descripcion: "Descripción",
  faltantes: "Faltantes",
  proveedorNit: "Proveedor creado (NIT)",
  motivoDescarte: "Motivo del descarte",
};

// Tesorería (flujo de caja, soportes, conciliación y cierre de mes).
Object.assign(ACTION_LABELS, { analizar: "Analizó", conciliar: "Concilió", desconciliar: "Quitó la conciliación", firmar: "Firmó", importar: "Importó", otorgar: "Dio acceso", quitar: "Quitó el acceso" });
Object.assign(ENTITY_LABELS, {
  movimientoTesoreria: "Movimiento de tesorería",
  maestroTesoreria: "Maestro de tesorería",
  accesoTesoreria: "Acceso a tesorería",
  conciliacionTesoreria: "Conciliación bancaria",
  cierreTesoreria: "Cierre de mes de tesorería",
  extractoTesoreria: "Extracto bancario",
  soporteTesoreria: "Soporte de movimiento",
});
export const MOVIMIENTO_TESORERIA_FIELD_LABELS = {
  fecha: "Fecha",
  tipo: "Tipo",
  estado: "Estado",
  valor: "Valor",
  moneda: "Moneda (ISO 4217)",
  cuenta: "Cuenta",
  cuentaDestino: "Cuenta destino",
  item: "Ítem",
  concepto: "Concepto",
  pagador: "Paga",
  tercero: "Tercero",
  referencia: "Referencia",
  observacion: "Observación",
};
export const MAESTRO_TESORERIA_FIELD_LABELS = {
  tipoMaestro: "Catálogo",
  nombre: "Nombre",
  tipo: "Tipo de cuenta",
  moneda: "Moneda (ISO 4217)",
  formatoExtracto: "Formato de extracto",
  saldoInicial: "Saldo inicial",
  saldoInicialFecha: "Fecha del saldo inicial",
  item: "Ítem por defecto",
  activo: "Activo",
};
export const ACCESO_TESORERIA_FIELD_LABELS = {
  persona: "Persona",
  nivel: "Nivel de acceso",
};
export const CONCILIACION_TESORERIA_FIELD_LABELS = {
  cuenta: "Cuenta",
  linea: "Línea del extracto",
  movimiento: "Movimiento",
  como: "Cómo se enlazó",
};
export const CIERRE_TESORERIA_FIELD_LABELS = {
  periodo: "Mes",
  diferencias: "Diferencias por cuenta",
};
export const EXTRACTO_TESORERIA_FIELD_LABELS = {
  cuenta: "Cuenta",
  archivo: "Archivo",
  lineasNuevas: "Líneas nuevas",
  lineasAprobadas: "Líneas aprobadas y registradas",
  lineasNoAprobadas: "Líneas no aprobadas",
  soloEnSistema: "En el sistema y no en el extracto",
  saldosGuardados: "Saldos del extracto guardados",
  lineasRepetidas: "Líneas ya cargadas",
  enlazadas: "Enlazadas solas",
};
export const SOPORTE_TESORERIA_FIELD_LABELS = {
  archivo: "Archivo",
  movimiento: "Movimiento",
};

// Soportes de pago que llegan al correo de soportes (Gmail compartido) y que Nova lee.
Object.assign(ENTITY_LABELS, { soporteCorreoTesoreria: "Soporte recibido por correo" });
export const SOPORTE_CORREO_TESORERIA_FIELD_LABELS = {
  estado: "Estado",
  remitente: "Remitente",
  asunto: "Asunto",
  archivo: "Archivo",
  valor: "Valor leído",
  fecha: "Fecha leída",
  tercero: "Tercero",
  sugerenciaMovimiento: "Movimiento que sugiere Nova",
  sugerenciaPago: "Pago que sugiere Nova",
  movimiento: "Movimiento registrado",
  motivoDescarte: "Motivo del descarte",
};

// Pagos recurrentes de Tesorería.
Object.assign(ACTION_LABELS, { generar: "Generó" });
Object.assign(ENTITY_LABELS, { recurrenciaTesoreria: "Pago recurrente de tesorería" });
export const RECURRENCIA_TESORERIA_FIELD_LABELS = {
  nombre: "Nombre",
  tipo: "Tipo",
  valor: "Valor",
  cuenta: "Cuenta",
  concepto: "Concepto",
  item: "Ítem",
  frecuencia: "Frecuencia",
  vigencia: "Vigencia",
  activo: "Activo",
};

// Tesorería desde cero (bancos, movimientos, pagos programados, gastos periódicos, asociaciones, agente y saldos).
Object.assign(ACTION_LABELS, { asociar: "Asoció", aceptar: "Aceptó", revisar: "Revisó", reabrir: "Reabrió" });
Object.assign(ENTITY_LABELS, {
  pagoTesoreria: "Pago programado",
  gastoPeriodicoTesoreria: "Gasto periódico",
  anioTesoreria: "Año de Tesorería",
  asociacionTesoreria: "Asociación movimiento ↔ pago",
  propuestaPagoTesoreria: "Propuesta del agente de asociación",
  saldoTesoreria: "Saldo inicial de banco",
  alertaTesoreria: "Alerta de tesorería",
  importacionTesoreria: "Importación de la plantilla de tesorería",
  movimientoTesoreria: "Movimiento del banco",
});
Object.assign(MOVIMIENTO_TESORERIA_FIELD_LABELS, {
  banco: "Banco",
  descripcion: "Descripción del banco",
  tipoCarga: "Tipo de carga",
  tipoSolicitud: "Tipo de solicitud",
  preparador: "Preparador",
  formato: "Formato",
});
Object.assign(MAESTRO_TESORERIA_FIELD_LABELS, { numeroCuenta: "Número de cuenta" });
export const PAGO_TESORERIA_FIELD_LABELS = {
  fecha: "Vence",
  tipo: "Tipo",
  estado: "Estado",
  valor: "Valor",
  item: "Ítem",
  concepto: "Concepto",
  medioPago: "Medio de pago",
  pagador: "Paga",
  observacion: "Observación",
  pagos: "Pagos",
};
export const ANIO_TESORERIA_FIELD_LABELS = { anio: "Año" };

export const GASTO_PERIODICO_TESORERIA_FIELD_LABELS = {
  tipo: "Tipo",
  concepto: "Concepto",
  item: "Ítem",
  medioPago: "Medio de pago",
  pagador: "Paga",
  valor: "Valor",
  periodicidad: "Periodicidad",
  diaCorte: "Día de corte",
  vigencia: "Vigencia",
  activo: "Activo",
  anio: "Año",
  gastos: "Gastos periódicos",
  pagosCreados: "Pagos creados",
};
export const ASOCIACION_TESORERIA_FIELD_LABELS = {
  movimiento: "Movimiento",
  pagos: "Pagos y valor asociado",
};
export const PROPUESTA_PAGO_TESORERIA_FIELD_LABELS = {
  propuestas: "Propuestas",
  alta: "Confianza alta",
  media: "Confianza media",
  baja: "Confianza baja",
  desempatesNova: "Desempates de Nova",
  confianza: "Confianza",
  motivo: "Motivo",
  valor: "Valor",
};
export const SALDO_TESORERIA_FIELD_LABELS = {
  banco: "Banco",
  anio: "Año",
  valor: "Saldo inicial",
};
export const ALERTA_TESORERIA_FIELD_LABELS = {
  alertas: "Alertas",
  estado: "Estado",
};
export const IMPORTACION_TESORERIA_FIELD_LABELS = {
  archivo: "Archivo",
  resumen: "Resumen",
  alertas: "Alertas creadas",
  catalogos: "Maestros creados",
};
Object.assign(EXTRACTO_TESORERIA_FIELD_LABELS, { banco: "Banco", aMano: "Ya registrados a mano" });

// Conciliación de Tesorería por banco y mes.
Object.assign(ACTION_LABELS, { verificar: "Verificó", desverificar: "Quitó la verificación" });
Object.assign(CONCILIACION_TESORERIA_FIELD_LABELS, { verificado: "Confirmado por el banco" });

// Consumo (servicios públicos por sede; ver backend/lib/consumo/*).
Object.assign(ENTITY_LABELS, {
  sedeConsumo: "Sede de consumo",
  empresaConsumo: "Empresa de servicio",
  cuentaConsumo: "Cuenta de servicio",
});
export const SEDE_CONSUMO_FIELD_LABELS = {
  nombre: "Nombre",
  edificio: "Edificio",
  direccion: "Dirección",
  ciudad: "Ciudad",
  activo: "Activa",
};
export const EMPRESA_CONSUMO_FIELD_LABELS = {
  nombre: "Nombre",
  nit: "NIT",
  servicios: "Servicios que factura",
  activo: "Activa",
};
export const CUENTA_CONSUMO_FIELD_LABELS = {
  sede: "Sede",
  servicio: "Servicio",
  empresa: "Empresa",
  numeroCuenta: "Número de cuenta",
  titular: "Titular",
  claseUso: "Clase de uso",
  estrato: "Estrato",
  periodicidad: "Periodicidad",
  direccionRecibo: "Dirección en el recibo",
  noAplica: "La sede no tiene este servicio",
  activo: "Activa",
  medidores: "Medidores",
};

Object.assign(ENTITY_LABELS, { reciboConsumo: "Recibo de consumo", soporteReciboConsumo: "Soporte de recibo de consumo" });
export const RECIBO_CONSUMO_FIELD_LABELS = {
  sede: "Sede",
  servicio: "Servicio",
  cuenta: "Número de cuenta",
  medidor: "Medidor",
  numeroFactura: "Número de factura",
  periodo: "Período facturado",
  dias: "Días facturados",
  mesReporte: "Mes de reporte",
  tipoLectura: "Tipo de lectura",
  lecturaAnterior: "Lectura anterior",
  lecturaActual: "Lectura actual",
  factor: "Factor del medidor",
  consumo: "Consumo",
  vigenciaTarifa: "Vigencia de la tarifa",
  valorUnitario: "Valor unitario",
  totalCargos: "Total cargos del período",
  saldoAnterior: "Saldo anterior",
  totalPagar: "Total a pagar",
  fechaExpedicion: "Fecha de expedición",
  fechaPagoOportuno: "Pago oportuno",
  fechaSuspension: "Fecha de suspensión",
  estadoPago: "Estado del pago",
  valorPagado: "Valor pagado",
  fechaPago: "Fecha de pago",
  origen: "Origen",
  nota: "Nota",
  cargos: "Cargos",
  soportes: "Soportes",
};
export const SOPORTE_RECIBO_CONSUMO_FIELD_LABELS = {
  archivo: "Archivo",
  recibo: "Recibo",
};
Object.assign(ENTITY_LABELS, { cargaInicialConsumo: "Carga inicial de Consumo" });
