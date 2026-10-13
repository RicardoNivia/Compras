// Copia frontend (sin Prisma) de las constantes de backend/lib/maestros.js —
// mismo patrón de duplicación que lib/roles.js. Si se agrega/renombra un tipo,
// actualizar ambas copias.
export const TIPOS_MAESTRO = ["area", "responsable", "estado", "categoria", "medioPago", "estadoLegalizacion", "causaCalificacion", "areaProveedor", "tipoProveedor", "clasificacionMonto", "tipoServicio", "motivoExcepcion"];

export const TIPO_LABELS = {
  area: "Área",
  responsable: "Responsable",
  estado: "Estado de compra",
  categoria: "Categoría",
  medioPago: "Medio de pago",
  estadoLegalizacion: "Estado legalización",
  causaCalificacion: "Causa de calificación",
  motivoExcepcion: "Motivo de excepción de proveedor",
  areaProveedor: "Área de proveedor",
  tipoProveedor: "Tipo de proveedor (criticidad)",
  clasificacionMonto: "Clasificación por monto",
  tipoServicio: "Tipo de servicio",
};

// Módulo dueño de cada maestro (copia de backend/lib/maestros.js#MODULO_POR_TIPO).
// Las áreas de Compras ("area") y de Proveedores ("areaProveedor") son maestros distintos.
export const MODULO_POR_TIPO = {
  area: "Compras",
  responsable: "Compras",
  estado: "Compras",
  categoria: "Compras",
  medioPago: "Compras",
  estadoLegalizacion: "Compras",
  causaCalificacion: "Compras",
  areaProveedor: "Proveedores",
  tipoProveedor: "Proveedores",
  clasificacionMonto: "Proveedores",
  tipoServicio: "Proveedores",
  motivoExcepcion: "Proveedores",
};

// Estrellas (1..4) a las que puede aplicar una causa de calificación —
// 5 estrellas nunca requiere causa, por eso no está en esta lista.
export const ESTRELLAS_CON_CAUSA = [1, 2, 3, 4];
