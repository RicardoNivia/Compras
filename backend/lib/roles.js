export const ROLES = {
  ADMIN: "admin",
  REGISTRO: "registro",
  LEGALIZAR: "legalizar",
  RADICAR: "radicar",
  PROVEEDORES: "proveedores",
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.REGISTRO]: "Registro",
  [ROLES.LEGALIZAR]: "Legalizar factura",
  [ROLES.RADICAR]: "Radicar",
  [ROLES.PROVEEDORES]: "Proveedores",
};

export const ROLE_LIST = Object.values(ROLES);

// Color/ícono por rol — usados en la tarjeta de usuario y los chips de filtro
// para poder "dimensionar" (agrupar/leer de un vistazo) usuarios por rol.
export const ROLE_COLOR_VARS = {
  [ROLES.ADMIN]: "--accent",
  [ROLES.REGISTRO]: "--secondary",
  [ROLES.LEGALIZAR]: "--warning",
  [ROLES.RADICAR]: "--good",
  [ROLES.PROVEEDORES]: "--muted",
};

export const ROLE_ICONS = {
  [ROLES.ADMIN]: "★",
  [ROLES.REGISTRO]: "◧",
  [ROLES.LEGALIZAR]: "▤",
  [ROLES.RADICAR]: "✓",
  [ROLES.PROVEEDORES]: "◎",
};

// Roles que trabajan en Compras (Registros, Dashboard de compras, Alertas, Nova).
// El rol Proveedores NO entra aquí: ve su módulo de proveedores, Maestros y Nova.
export const ROLES_COMPRAS = [ROLES.ADMIN, ROLES.REGISTRO, ROLES.LEGALIZAR, ROLES.RADICAR];

// admin: acceso total — el único que puede eliminar registros y el único que
//   puede editar/mover la fecha de solicitud de un registro ya creado.
// registro: dashboard + registros (crear/editar, sin eliminar), sin
//   administración de usuarios ni el check de radicado (eso es solo de
//   admin/radicar); al editar no puede tocar la fecha de solicitud.
// legalizar: solo tabla de registros; puede editar (campos limitados, ver
//   LEGALIZAR_EDITABLE_FIELDS), no crear ni eliminar.
// radicar: solo tabla de registros; solo puede marcar el check de radicado
//   (nunca desmarcarlo), y solo si el registro ya está "Legalizado".
// Dashboard y Agente IA son visibles para cualquier rol autenticado.

export function canViewDashboard(role) {
  return ROLES_COMPRAS.includes(role);
}

export function canViewUsuarios(role) {
  return role === ROLES.ADMIN;
}

export function canViewAgenteIA(role) {
  return ROLES_COMPRAS.includes(role) || role === ROLES.PROVEEDORES;
}

export function canViewAuditoria(role) {
  return role === ROLES.ADMIN;
}

// El rol Proveedores también administra Maestros (tipo, clasificación por monto,
// tipo de servicio, motivos de excepción y el ciclo de proveedores).
export function canViewMaestros(role) {
  return role === ROLES.ADMIN || role === ROLES.PROVEEDORES;
}

// Módulo de proveedores: maestro, tablero del ciclo e indicadores.
export function canViewRegistros(role) {
  return ROLES_COMPRAS.includes(role);
}

export function canViewProveedores(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO || role === ROLES.PROVEEDORES;
}

// Cambiar estados, documentos, excepciones e inactivos de proveedores.
export function canEditProveedores(role) {
  return role === ROLES.ADMIN || role === ROLES.PROVEEDORES;
}

export function canViewPresupuesto(role) {
  return role === ROLES.ADMIN;
}

// Agentes de Compras (página /agentes): revisor, proveedor y precio, cotizador y verificar factura. El vigía de
// presupuesto exige además viewPresupuesto y el detector de anomalías su propia feature. Por ahora solo admin: a
// otros roles se les da desde la Matriz de permisos (Compras › Agentes).
export function canViewAgentesCompras(role) {
  return role === ROLES.ADMIN;
}

export function canViewAnomaliasCompras(role) {
  return role === ROLES.ADMIN;
}

// Módulo de Bienestar: actividades del cronograma, su presupuesto y las compras asociadas.
export function canViewBienestar(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canViewDashboardBienestar(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canViewMaestrosBienestar(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canEditBienestar(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canViewReportes(role) {
  return role === ROLES.ADMIN;
}

// "Mi día y alertas": lo que le toca hoy a cada rol. También lo ve Proveedores (sus pendientes de actualización).
export function canViewAlertas(role) {
  return ROLES_COMPRAS.includes(role) || role === ROLES.PROVEEDORES;
}

// Notificaciones configurables (app y Teams): cada persona arma las suyas sobre los datos que ya ve.
export function canViewNotificaciones(role) {
  return ROLES_COMPRAS.includes(role) || role === ROLES.PROVEEDORES;
}

export function canCreateRecord(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canEditRecord(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO || role === ROLES.LEGALIZAR;
}

export function canDeleteRecord(role) {
  return role === ROLES.ADMIN;
}

export function canToggleRadicado(role) {
  return role === ROLES.ADMIN || role === ROLES.RADICAR;
}

// legalizar solo puede tocar estos 5 campos al editar un registro; el resto
// queda intacto sin importar qué envíe el cliente (ver lib/records.js#updateRecord).
export const LEGALIZAR_EDITABLE_FIELDS = [
  "estadoLegalizacion",
  "estadoLegalizacionId",
  "fe",
  "valorConIva",
  "valorSinIva",
  "moneda",
  "valorUsd",
  "trm",
  "observaciones",
];

// Todos los campos de un registro que se pueden editar (todo salvo
// fechaSolicitud) — usado para restringir a roles no-admin, que no pueden
// modificar ni mover la fecha de solicitud una vez creado el registro.
export const NON_ADMIN_EDITABLE_FIELDS = [
  "informe",
  "fechaEntrega",
  "area",
  "areaId",
  "responsable",
  "responsableUserId",
  "estado",
  "estadoId",
  "categoria",
  "categoriaId",
  "descripcion",
  "medioPago",
  "medioPagoId",
  "licitacion",
  "estadoLegalizacion",
  "estadoLegalizacionId",
  "nit",
  "proveedor",
  "proveedorNit",
  "fe",
  "valorConIva",
  "valorSinIva",
  "valorCot",
  "moneda",
  "valorUsd",
  "trm",
  "observaciones",
  "radicado",
];

// Campos editables al EDITAR un registro ya existente (no aplica a la creación).
// null = todos los campos (solo admin, incluye fechaSolicitud).
export function getEditableFields(role) {
  if (role === ROLES.ADMIN) return null;
  if (role === ROLES.LEGALIZAR) return LEGALIZAR_EDITABLE_FIELDS;
  return NON_ADMIN_EDITABLE_FIELDS;
}

// Campos que puede tocar cada rol vía PATCH (usado solo para el toggle de
// radicado). radicar solo puede tocar "radicado"; el resto de roles con
// permiso de PATCH (admin) no tiene restricción de campos.
export function getPatchableFields(role) {
  if (role === ROLES.RADICAR) return ["radicado"];
  return null;
}

// Vincular el correo de Microsoft 365 para que el agente lea las solicitudes de creación de proveedor (Mi correo).
export function canVincularCorreo(role) {
  return role === ROLES.ADMIN || role === ROLES.PROVEEDORES;
}
