import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Editar ya no es una página aparte: la actividad se configura en su ficha. Los enlaces viejos (avisos, favoritos)
// llegan aquí y pasan a la pestaña equivalente.
export default function BienestarEditarActividadPage({ params, searchParams }) {
  redirect(`/bienestar/actividades/${encodeURIComponent(params.id)}?tab=${searchParams?.paso === "compras" ? "compras" : "datos"}`);
}
