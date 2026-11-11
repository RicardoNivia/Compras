import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Crear una actividad ya no es una página: es el botón "Nueva actividad" (un modal que pide el nombre) y luego su ficha.
// Los enlaces viejos llegan aquí y pasan a la lista de actividades.
export default function FundacionNuevaActividadPage() {
  redirect("/bienestar/fundacion/actividades");
}
