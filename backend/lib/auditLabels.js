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
  observaciones: "Observaciones",
  radicado: "Radicado",
};

export const MAESTRO_FIELD_LABELS = {
  tipo: "Tipo",
  valor: "Valor",
  activo: "Activo",
  presupuestoAnual: "Presupuesto anual",
};

export const USER_FIELD_LABELS = {
  nombre: "Nombre",
  email: "Correo",
  role: "Rol",
  activo: "Activo",
};

export const ACTION_LABELS = {
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
  radicar: "Radicó",
};
