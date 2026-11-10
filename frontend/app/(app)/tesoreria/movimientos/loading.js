import { PaginaTesoreria, FiltrosEsqueleto, TableSkeleton } from "@/components/tesoreria/Esqueletos";

// Forma de la pantalla mientras el servidor resuelve la sesión y el acceso (igual que las demás rutas).
export default function Loading() {
  return <PaginaTesoreria titulo="Movimientos"><div className="tes-vista"><FiltrosEsqueleto campos={6} /><TableSkeleton rows={10} /></div></PaginaTesoreria>;
}
