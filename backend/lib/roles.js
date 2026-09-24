export const ROLES = {
  ADMIN: "admin",
  REGISTRO: "registro",
  LEGALIZAR: "legalizar",
  RADICAR: "radicar",
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.REGISTRO]: "Registro",
  [ROLES.LEGALIZAR]: "Legalizar factura",
  [ROLES.RADICAR]: "Radicar",
};

export const ROLE_LIST = Object.values(ROLES);

// Color/ícono por rol — usados en la tarjeta de usuario y los chips de filtro
// para poder "dimensionar" (agrupar/leer de un vistazo) usuarios por rol.
export const ROLE_COLOR_VARS = {
  [ROLES.ADMIN]: "--accent",
  [ROLES.REGISTRO]: "--secondary",
  [ROLES.LEGALIZAR]: "--warning",
  [ROLES.RADICAR]: "--good",
};

export const ROLE_ICONS = {
  [ROLES.ADMIN]: "★",
  [ROLES.REGISTRO]: "◧",
  [ROLES.LEGALIZAR]: "▤",
  [ROLES.RADICAR]: "✓",
};

// admin: acceso total, incluye marcar/desmarcar radicado.
// registro: dashboard + registros (crear/editar/eliminar), sin administración de
//   usuarios ni el check de radicado (eso es solo de admin/radicar).
// legalizar: solo tabla de registros; puede editar (campos limitados, ver
//   LEGALIZAR_EDITABLE_FIELDS), no crear ni eliminar.
// radicar: solo tabla de registros; solo puede marcar/desmarcar el check de radicado.
// Dashboard y Agente IA son visibles para cualquier rol autenticado.

export function canViewDashboard(role) {
  return ROLE_LIST.includes(role);
}

export function canViewUsuarios(role) {
  return role === ROLES.ADMIN;
}

export function canViewAgenteIA(role) {
  return ROLE_LIST.includes(role);
}

export function canViewAuditoria(role) {
  return role === ROLES.ADMIN;
}

export function canViewMaestros(role) {
  return role === ROLES.ADMIN;
}

export function canCreateRecord(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canEditRecord(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO || role === ROLES.LEGALIZAR;
}

export function canDeleteRecord(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canToggleRadicado(role) {
  return role === ROLES.ADMIN || role === ROLES.RADICAR;
}

// legalizar solo puede tocar estos 5 campos al editar un registro; el resto
// queda intacto sin importar qué envíe el cliente (ver lib/records.js#updateRecord).
export const LEGALIZAR_EDITABLE_FIELDS = [
  "estadoLegalizacion",
  "fe",
  "valorConIva",
  "valorSinIva",
  "observaciones",
];

// null = todos los campos editables (admin, registro).
export function getEditableFields(role) {
  if (role === ROLES.LEGALIZAR) return LEGALIZAR_EDITABLE_FIELDS;
  return null;
}
