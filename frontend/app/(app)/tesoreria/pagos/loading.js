import { PaginaTesoreria, FiltrosEsqueleto, TableSkeleton } from "@/components/tesoreria/Esqueletos";

// Forma de la pantalla mientras el servidor resuelve la sesión y el acceso (igual que las demás rutas).
export default function Loading() {
  return <PaginaTesoreria titulo="Pagos programados"><div className="tes-vista"><FiltrosEsqueleto campos={5} /><TableSkeleton rows={10} /></div></PaginaTesoreria>;
}
