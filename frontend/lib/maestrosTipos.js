// Copia frontend (sin Prisma) de las constantes de backend/lib/maestros.js —
// mismo patrón de duplicación que lib/roles.js. Si se agrega/renombra un tipo,
// actualizar ambas copias.
export const TIPOS_MAESTRO = ["area", "responsable", "estado", "medioPago", "estadoLegalizacion"];

export const TIPO_LABELS = {
  area: "Área",
  responsable: "Responsable",
  estado: "Estado de compra",
  medioPago: "Medio de pago",
  estadoLegalizacion: "Estado legalización",
};
