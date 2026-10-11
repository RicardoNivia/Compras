// Copia frontend (sin Prisma) de las constantes de backend/lib/maestros.js —
// mismo patrón de duplicación que lib/roles.js. Si se agrega/renombra un tipo,
// actualizar ambas copias.
export const TIPOS_MAESTRO = ["area", "responsable", "estado", "categoria", "medioPago", "estadoLegalizacion", "causaCalificacion", "motivoExcepcion"];

export const TIPO_LABELS = {
  area: "Área",
  responsable: "Responsable",
  estado: "Estado de compra",
  categoria: "Categoría",
  medioPago: "Medio de pago",
  estadoLegalizacion: "Estado legalización",
  causaCalificacion: "Causa de calificación",
  motivoExcepcion: "Motivo de excepción de proveedor",
};

// Estrellas (1..4) a las que puede aplicar una causa de calificación —
// 5 estrellas nunca requiere causa, por eso no está en esta lista.
export const ESTRELLAS_CON_CAUSA = [1, 2, 3, 4];
