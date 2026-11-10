import { PaginaTesoreria, MaestrosEsqueleto } from "@/components/tesoreria/Esqueletos";

// Forma de la pantalla mientras el servidor resuelve la sesión y el acceso (igual que las demás rutas).
export default function Loading() {
  return <PaginaTesoreria titulo="Maestros de Tesorería"><MaestrosEsqueleto /></PaginaTesoreria>;
}
