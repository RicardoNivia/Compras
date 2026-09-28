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
  return role === ROLES.ADMIN;
}

export function canToggleRadicado(role) {
  return role === ROLES.ADMIN || role === ROLES.RADICAR;
}

// Agente IA: visible para todos, pero solo admin puede usar modelos "paid"
// (ver lib/geminiModels.js) — el resto queda limitado a los modelos "free".
export function canUsePaidModels(role) {
  return role === ROLES.ADMIN;
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

// Todos los campos de un registro que se pueden editar (todo salvo
// fechaSolicitud) — usado para restringir a roles no-admin, que no pueden
// modificar ni mover la fecha de solicitud una vez creado el registro.
export const NON_ADMIN_EDITABLE_FIELDS = [
  "informe",
  "fechaEntrega",
  "area",
  "responsable",
  "estado",
  "categoria",
  "descripcion",
  "medioPago",
  "licitacion",
  "estadoLegalizacion",
  "proveedor",
  "fe",
  "valorConIva",
  "valorSinIva",
  "valorCot",
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
