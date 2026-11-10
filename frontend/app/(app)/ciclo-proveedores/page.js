import { redirect } from "next/navigation";

// El Ciclo de proveedores ya no es un menú independiente: vive dentro de Maestros.
// Se conserva esta ruta para que los enlaces viejos sigan funcionando.
export default function CicloProveedoresPage() {
  redirect("/maestros?seccion=cicloProveedores");
}
