// Opciones de los selectores de la ficha de proveedor, tomadas de los valores reales del Excel de
// Gestión de Proveedores. Copia (sin Prisma) de backend/lib/proveedoresCicloReglas.js — mantener ambas en sync.
export const CLASIFICACIONES_MONTO = ["Adquisición de Bajo Impacto", "Operación de Alto Costo", "Grandes Contribuyentes o excepciones", "Proveedor Internacional"];
export const REVISIONES = ["SRM", "Financiero"];
export const ESTADOS_CICLO = [
  { key: "desactualizado", label: "Desactualizado" },
  { key: "en_proceso", label: "En proceso" },
  { key: "en_aprobacion", label: "En aprobación" },
  { key: "actualizado", label: "Actualizado" },
];
