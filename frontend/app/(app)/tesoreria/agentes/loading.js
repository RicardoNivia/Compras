import { PaginaTesoreria, CardSkeleton } from "@/components/tesoreria/Esqueletos";

// Forma de la pantalla mientras el servidor resuelve la sesión y el acceso (igual que las demás rutas).
export default function Loading() {
  return <PaginaTesoreria titulo="Agentes"><div className="tes-vista"><CardSkeleton height={160} /><CardSkeleton height={320} /></div></PaginaTesoreria>;
}
