import { PaginaTesoreria, CardSkeleton } from "@/components/tesoreria/Esqueletos";

// Forma de la pantalla mientras el servidor resuelve la sesión y el acceso (igual que las demás rutas).
export default function Loading() {
  return <PaginaTesoreria titulo="Cierre de mes"><div className="tes-dos"><CardSkeleton height={320} /><CardSkeleton height={320} /></div></PaginaTesoreria>;
}
