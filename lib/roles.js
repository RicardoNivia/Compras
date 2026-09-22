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

// admin: acceso total.
// registro: dashboard + registros (CRUD completo), sin administración de usuarios.
// legalizar: solo tabla de registros; puede editar, no crear ni eliminar.
// radicar: solo tabla de registros; solo puede marcar/desmarcar el check de radicado.

export function canViewDashboard(role) {
  return role === ROLES.ADMIN || role === ROLES.REGISTRO;
}

export function canViewUsuarios(role) {
  return role === ROLES.ADMIN;
}

export function canViewAgenteIA(role) {
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
  return role === ROLES.ADMIN || role === ROLES.REGISTRO || role === ROLES.RADICAR;
}
