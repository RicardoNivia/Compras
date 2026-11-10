// Módulos de la aplicación: cada uno tiene su menú y su color de tema (ver components/ModuloShell.jsx y el bloque
// "Tema por módulo" de app/globals.css). Las rutas generales (Alertas, Nova, Usuarios, Auditoría…) no son de ningún
// módulo: conservan el módulo en el que la persona venía trabajando (cookie "modulo").

export const MODULOS = {
  compras: { key: "compras", nombre: "Compras", descripcion: "Solicitudes, proveedores y presupuesto" },
  bienestar: { key: "bienestar", nombre: "Bienestar", descripcion: "Actividades, cronograma y su costo" },
  tesoreria: { key: "tesoreria", nombre: "Tesorería", descripcion: "Flujo de caja, soportes, conciliación y cierre" },
};

export const MODULO_POR_DEFECTO = "compras";
export const COOKIE_MODULO = "modulo";

const RUTAS = [
  ["/bienestar", "bienestar"],
  ["/tesoreria", "tesoreria"],
  ["/dashboard", "compras"],
  ["/registros", "compras"],
  ["/proveedores", "compras"],
  ["/ciclo-proveedores", "compras"],
  ["/maestros", "compras"],
  ["/presupuesto", "compras"],
  ["/informes", "compras"],
  ["/ver-informes", "compras"],
  ["/agentes", "compras"],
];

// El módulo dueño de una ruta, o null si es una ruta general.
export function moduloDeRuta(pathname) {
  const hit = RUTAS.find(([prefijo]) => pathname === prefijo || pathname?.startsWith(`${prefijo}/`));
  return hit ? hit[1] : null;
}

export function moduloValido(m) {
  return MODULOS[m] ? m : null;
}
