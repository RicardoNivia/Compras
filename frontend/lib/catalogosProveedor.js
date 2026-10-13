import { backendFetch } from "@/lib/backendFetch";

// Maestros de Proveedores para formularios y filtros (Server Components). Se traen todos
// (también inactivos) para poder mostrar el valor actual de un proveedor; los formularios
// solo ofrecen los activos.
const TIPOS = { areas: "areaProveedor", tipos: "tipoProveedor", clasificaciones: "clasificacionMonto", servicios: "tipoServicio", motivos: "motivoExcepcion" };

export async function cargarCatalogosProveedor() {
  const entradas = await Promise.all(
    Object.entries(TIPOS).map(async ([clave, tipo]) => {
      const res = await backendFetch(`/api/maestros?tipo=${tipo}`);
      const { maestros = [] } = res.ok ? await res.json() : {};
      return [clave, maestros];
    })
  );
  return Object.fromEntries(entradas);
}
