import { PaginaTesoreria, ResumenEsqueleto } from "@/components/tesoreria/Esqueletos";

// Forma de la pantalla mientras el servidor resuelve la sesión y el acceso (igual que las demás rutas).
export default function Loading() {
  return <PaginaTesoreria titulo="Resumen de Tesorería"><ResumenEsqueleto /></PaginaTesoreria>;
}
