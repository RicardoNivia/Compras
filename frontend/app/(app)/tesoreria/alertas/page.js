import { redirect } from "next/navigation";

// Las alertas de Tesorería no tienen página propia: llegan a Alertas y notificaciones › Mi día.
export default function Pagina() {
  redirect("/alertas");
}
