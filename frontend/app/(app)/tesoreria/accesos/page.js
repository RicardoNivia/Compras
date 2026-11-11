import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Los accesos a Tesorería ya no se dan en el módulo sino por rol en Usuarios y roles (Matriz de permisos, pestaña
// Tesorería: verTesoreria / registrarTesoreria / firmarTesoreria). Esta ruta solo redirige allá.
export default function Pagina() {
  redirect("/usuarios");
}
