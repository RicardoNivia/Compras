import { cookies } from "next/headers";
import "./globals.css";

export const metadata = {
  title: "Panel de Compras y Bienestar",
  description: "Sinco · Panel de Compras y Bienestar: compras, proveedores y presupuesto; actividades de Bienestar y Fundación",
};

// El tema (claro u oscuro) que la persona eligió en el menú se guarda en la cookie "tema" y se pone acá, en el
// servidor, como data-theme de <html>: así la página nunca parpadea con el otro tema. Sin cookie no se pone nada y
// el CSS sigue al sistema operativo (prefers-color-scheme).
export default function RootLayout({ children }) {
  const elegido = cookies().get("tema")?.value;
  const tema = elegido === "dark" || elegido === "light" ? elegido : undefined;
  return (
    <html lang="es" data-theme={tema}>
      <body>{children}</body>
    </html>
  );
}
