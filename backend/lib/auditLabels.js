// Etiquetas compartidas entre el servidor (lib/audit.js) y componentes
// cliente (AuditoriaView) — sin dependencias de Prisma para poder importarse
// en el bundle del navegador.

export const FIELD_LABELS = {
  informe: "Informe",
  fechaSolicitud: "Fecha solicitud",
  fechaEntrega: "Fecha entrega",
  area: "Área",
  responsable: "Responsable",
  estado: "Estado",
  categoria: "Categoría",
  descripcion: "Descripción",
  medioPago: "Medio de pago",
  licitacion: "Licitación",
  estadoLegalizacion: "Estado legalización",
  proveedor: "Proveedor",
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
  activo: "Activo",
};

export const USER_FIELD_LABELS = {
  nombre: "Nombre",
  email: "Correo",
  role: "Rol",
  activo: "Activo",
};

export const REPORT_FIELD_LABELS = {
  nombre: "Nombre",
  prompt: "Instrucción (prompt)",
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
  activo: "Activo",
};

export const ACTION_LABELS = {
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
  radicar: "Radicó",
  enviar: "Envió",
  bloqueoIa: "Bloqueó respuesta IA",
};
